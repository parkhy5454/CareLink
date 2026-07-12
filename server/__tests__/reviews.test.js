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

describe('병원 리뷰', () => {
  test('확정되지 않은 예약으로는 리뷰를 남길 수 없다', async () => {
    const { token } = await signupTestUser(request)
    const res = await request(app).post(`/api/hospitals/${TEST_HOSPITAL_CODE}/reviews`).set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, comment: '좋아요', bookingId: 99999 })
    expect(res.status).toBe(400)
  })

  test('확정된 예약으로 리뷰를 남기면 평균 별점에 반영된다', async () => {
    const { token } = await signupTestUser(request)
    const membersRes = await request(app).get('/api/family-members').set('Authorization', `Bearer ${token}`)
    const patientId = membersRes.body.members[0].id
    const booking = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시', patientId })
    const bookingId = booking.body.booking.id

    await createStaffAccount({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'revhosp', password: 'hosp1234' })
    const staffLogin = await request(app).post('/api/auth/staff/login').send({ username: 'revhosp', password: 'hosp1234' })
    await request(app).post(`/api/hospital/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${staffLogin.body.token}`)

    const review = await request(app).post(`/api/hospitals/${TEST_HOSPITAL_CODE}/reviews`).set('Authorization', `Bearer ${token}`)
      .send({ rating: 4, comment: '친절해요', bookingId })
    expect(review.status).toBe(200)

    const list = await request(app).get(`/api/hospitals/${TEST_HOSPITAL_CODE}/reviews`)
    expect(list.body.averageRating).toBe(4)
    expect(list.body.count).toBe(1)
  })

  test('같은 예약으로 두 번 리뷰를 남기면 409', async () => {
    const { token } = await signupTestUser(request)
    const membersRes = await request(app).get('/api/family-members').set('Authorization', `Bearer ${token}`)
    const patientId = membersRes.body.members[0].id
    const booking = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시', patientId })
    const bookingId = booking.body.booking.id

    await createStaffAccount({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'revhosp2', password: 'hosp1234' })
    const staffLogin = await request(app).post('/api/auth/staff/login').send({ username: 'revhosp2', password: 'hosp1234' })
    await request(app).post(`/api/hospital/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${staffLogin.body.token}`)

    await request(app).post(`/api/hospitals/${TEST_HOSPITAL_CODE}/reviews`).set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, comment: '1차', bookingId })
    const second = await request(app).post(`/api/hospitals/${TEST_HOSPITAL_CODE}/reviews`).set('Authorization', `Bearer ${token}`)
      .send({ rating: 1, comment: '2차', bookingId })
    expect(second.status).toBe(409)
  })

  test('별점 범위를 벗어나면 400', async () => {
    const { token } = await signupTestUser(request)
    const res = await request(app).post(`/api/hospitals/${TEST_HOSPITAL_CODE}/reviews`).set('Authorization', `Bearer ${token}`)
      .send({ rating: 6, comment: '별점 초과' })
    expect(res.status).toBe(400)
  })
})
