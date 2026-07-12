import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import {
  app, setupTestDb, closeTestDb, resetTransactionalTables, seedTestFacilities,
  signupTestUser, createStaffAccount, TEST_HOSPITAL_CODE, TEST_PHARMACY_CODE, TEST_PHARMACY_CODE_2
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

async function bookAndConfirm(token) {
  const membersRes = await request(app).get('/api/family-members').set('Authorization', `Bearer ${token}`)
  const patientId = membersRes.body.members[0].id
  const created = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
    .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시', patientId })
  return created.body.booking.id
}

describe('처방전 전송', () => {
  test('약국 없이 전송하면 400', async () => {
    const { token } = await signupTestUser(request)
    const res = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(400)
  })

  test('정상 전송하면 pending 상태로 생성된다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const res = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`)
      .send({ bookingId, pharmacyCode: TEST_PHARMACY_CODE, imageBase64: 'dGVzdA==', imageMimeType: 'image/jpeg' })
    expect(res.status).toBe(200)
    expect(res.body.prescription.status).toBe('pending')
  })
})

describe('약국 대시보드 - 수락/거절/완료', () => {
  async function sendPrescription(token, bookingId) {
    const res = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`)
      .send({ bookingId, pharmacyCode: TEST_PHARMACY_CODE, imageBase64: 'dGVzdA==', imageMimeType: 'image/jpeg' })
    return res.body.prescription.id
  }

  async function pharmacyStaffToken(username) {
    const uname = username || `pstaff${Date.now()}${Math.random().toString(36).slice(2)}`
    await createStaffAccount({ role: 'pharmacy', facilityCode: TEST_PHARMACY_CODE, username: uname, password: 'pharm1234' })
    const res = await request(app).post('/api/auth/staff/login').send({ username: uname, password: 'pharm1234' })
    return res.body.token
  }

  test('수락하면 상태가 accepted로 바뀐다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const rxId = await sendPrescription(token, bookingId)
    const staffToken = await pharmacyStaffToken()

    const res = await request(app).post(`/api/pharmacy/prescriptions/${rxId}/accept`).set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body.prescription.status).toBe('accepted')
  })

  test('수락 전에는 조제완료 처리할 수 없다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const rxId = await sendPrescription(token, bookingId)
    const staffToken = await pharmacyStaffToken()

    const res = await request(app).post(`/api/pharmacy/prescriptions/${rxId}/ready`).set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(404)
  })

  test('수락 후에는 조제완료 처리할 수 있다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const rxId = await sendPrescription(token, bookingId)
    const staffToken = await pharmacyStaffToken()

    await request(app).post(`/api/pharmacy/prescriptions/${rxId}/accept`).set('Authorization', `Bearer ${staffToken}`)
    const res = await request(app).post(`/api/pharmacy/prescriptions/${rxId}/ready`).set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(200)
    expect(res.body.prescription.status).toBe('ready')
  })

  test('거절하면 사유가 함께 저장된다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const rxId = await sendPrescription(token, bookingId)
    const staffToken = await pharmacyStaffToken()

    const res = await request(app).post(`/api/pharmacy/prescriptions/${rxId}/reject`).set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: '재고 없음' })
    expect(res.status).toBe(200)
    expect(res.body.prescription.status).toBe('rejected')
    expect(res.body.prescription.reject_reason).toBe('재고 없음')
  })
})

describe('처방전 재전송 (거절 후 다른 약국으로)', () => {
  test('거절되지 않은 처방전은 재전송할 수 없다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const sendRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`)
      .send({ bookingId, pharmacyCode: TEST_PHARMACY_CODE, imageBase64: 'dGVzdA==', imageMimeType: 'image/jpeg' })
    const rxId = sendRes.body.prescription.id

    const tooEarly = await request(app).post(`/api/prescriptions/${rxId}/resend`).set('Authorization', `Bearer ${token}`)
      .send({ pharmacyCode: TEST_PHARMACY_CODE_2 })
    expect(tooEarly.status).toBe(400)
  })

  test('거절 후 재전송하면 같은 사진으로 새 처방전이 생성된다', async () => {
    const { token } = await signupTestUser(request)
    const bookingId = await bookAndConfirm(token)
    const sendRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`)
      .send({ bookingId, pharmacyCode: TEST_PHARMACY_CODE, imageBase64: 'dGVzdGltYWdl', imageMimeType: 'image/jpeg' })
    const rxId = sendRes.body.prescription.id

    await createStaffAccount({ role: 'pharmacy', facilityCode: TEST_PHARMACY_CODE, username: 'pstaffA', password: 'pharm1234' })
    const staffLogin = await request(app).post('/api/auth/staff/login').send({ username: 'pstaffA', password: 'pharm1234' })
    await request(app).post(`/api/pharmacy/prescriptions/${rxId}/reject`).set('Authorization', `Bearer ${staffLogin.body.token}`)
      .send({ reason: '품절' })

    const resend = await request(app).post(`/api/prescriptions/${rxId}/resend`).set('Authorization', `Bearer ${token}`)
      .send({ pharmacyCode: TEST_PHARMACY_CODE_2 })
    expect(resend.status).toBe(200)
    expect(resend.body.prescription.status).toBe('pending')
    expect(resend.body.prescription.pharmacy_code).toBe(TEST_PHARMACY_CODE_2)

    await createStaffAccount({ role: 'pharmacy', facilityCode: TEST_PHARMACY_CODE_2, username: 'pstaffB', password: 'pharm1234' })
    const staffLogin2 = await request(app).post('/api/auth/staff/login').send({ username: 'pstaffB', password: 'pharm1234' })
    const image = await request(app).get(`/api/pharmacy/prescriptions/${resend.body.prescription.id}/image`)
      .set('Authorization', `Bearer ${staffLogin2.body.token}`)
    expect(image.body.imageBase64).toBe('dGVzdGltYWdl')
  })
})
