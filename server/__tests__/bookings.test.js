import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import {
  app, setupTestDb, closeTestDb, resetTransactionalTables, seedTestFacilities,
  signupTestUser, createStaffAccount, TEST_HOSPITAL_CODE
} from './helpers.js'

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await resetTransactionalTables()
  await seedTestFacilities()
})

async function getSelfMemberId(token) {
  const res = await request(app).get('/api/family-members').set('Authorization', `Bearer ${token}`)
  return res.body.members[0].id
}

describe('예약 생성', () => {
  test('patientId 없이 예약하면 400', async () => {
    const { token } = await signupTestUser(request)
    const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시' })
    expect(res.status).toBe(400)
  })

  test('유효하지 않은 시간대로 예약하면 400', async () => {
    const { token } = await signupTestUser(request)
    const patientId = await getSelfMemberId(token)
    const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '아무 시간', patientId })
    expect(res.status).toBe(400)
  })

  test('정상적으로 예약하면 pending 상태로 생성된다', async () => {
    const { token } = await signupTestUser(request)
    const patientId = await getSelfMemberId(token)
    const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시', patientId })
    expect(res.status).toBe(200)
    expect(res.body.booking.status).toBe('pending')
    expect(res.body.booking.patient_name).toBe('테스트유저')
  })

  test('같은 시간을 두 환자가 예약하면 두 번째는 409', async () => {
    const a = await signupTestUser(request)
    const b = await signupTestUser(request)
    const aPatientId = await getSelfMemberId(a.token)
    const bPatientId = await getSelfMemberId(b.token)

    const first = await request(app).post('/api/bookings').set('Authorization', `Bearer ${a.token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 11시', patientId: aPatientId })
    expect(first.status).toBe(200)

    const second = await request(app).post('/api/bookings').set('Authorization', `Bearer ${b.token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 11시', patientId: bPatientId })
    expect(second.status).toBe(409)
  })

  test('시간표 조회 시 이미 예약된 시간은 taken:true로 표시된다', async () => {
    const { token } = await signupTestUser(request)
    const patientId = await getSelfMemberId(token)
    await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오후 2시', patientId })

    const slots = await request(app).get(`/api/hospitals/${TEST_HOSPITAL_CODE}/slots`)
    const day1 = slots.body.days.find((d) => d.day === '내일')
    const slot = day1.times.find((t) => t.time === '오후 2시')
    expect(slot.taken).toBe(true)
  })
})

describe('예약 취소', () => {
  test('취소하면 상태가 cancelled로 바뀌고 시간이 다시 열린다', async () => {
    const { token } = await signupTestUser(request)
    const patientId = await getSelfMemberId(token)
    const created = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오후 3시 30분', patientId })
    const bookingId = created.body.booking.id

    const cancelled = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.booking.status).toBe('cancelled')

    const slots = await request(app).get(`/api/hospitals/${TEST_HOSPITAL_CODE}/slots`)
    const day1 = slots.body.days.find((d) => d.day === '내일')
    const slot = day1.times.find((t) => t.time === '오후 3시 30분')
    expect(slot.taken).toBe(false)
  })

  test('이미 취소된 예약을 다시 취소하면 404', async () => {
    const { token } = await signupTestUser(request)
    const patientId = await getSelfMemberId(token)
    const created = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '이번 주 목요일 오전 9시 30분', patientId })
    const bookingId = created.body.booking.id

    await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`)
    const second = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(second.status).toBe(404)
  })

  test('다른 사람의 예약은 취소할 수 없다', async () => {
    const a = await signupTestUser(request)
    const b = await signupTestUser(request)
    const aPatientId = await getSelfMemberId(a.token)
    const created = await request(app).post('/api/bookings').set('Authorization', `Bearer ${a.token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '이번 주 금요일 오전 10시', patientId: aPatientId })
    const bookingId = created.body.booking.id

    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${b.token}`)
    expect(res.status).toBe(404)
  })
})

describe('병원 대시보드 - 예약 확정/거절', () => {
  test('확정하면 환자 쪽에서도 confirmed로 보인다', async () => {
    const { token } = await signupTestUser(request)
    const patientId = await getSelfMemberId(token)
    const created = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시', patientId })
    const bookingId = created.body.booking.id

    await createStaffAccount({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'hstaff1', password: 'hosp1234' })
    const staffLogin = await request(app).post('/api/auth/staff/login').send({ username: 'hstaff1', password: 'hosp1234' })
    const staffToken = staffLogin.body.token

    const confirm = await request(app).post(`/api/hospital/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${staffToken}`)
    expect(confirm.status).toBe(200)

    const latest = await request(app).get('/api/bookings/latest').set('Authorization', `Bearer ${token}`)
    expect(latest.body.booking.status).toBe('confirmed')
  })

  test('약국 계정으로는 병원 API에 접근할 수 없다 (403)', async () => {
    await createStaffAccount({ role: 'pharmacy', facilityCode: null, username: 'pstaff1', password: 'pharm1234' })
    const staffLogin = await request(app).post('/api/auth/staff/login').send({ username: 'pstaff1', password: 'pharm1234' })
    const res = await request(app).get('/api/hospital/bookings').set('Authorization', `Bearer ${staffLogin.body.token}`)
    expect(res.status).toBe(403)
  })
})
