import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import {
  app, setupTestDb, closeTestDb, resetTransactionalTables, seedTestFacilities,
  signupTestUser, createStaffAccount, TEST_HOSPITAL_CODE, TEST_PHARMACY_CODE
} from './helpers.js'
import { pool } from '../db.js'
import { sendDueReminders } from '../reminders.js'

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

async function bookConfirmAndSendPrescription(token, dosage = {}) {
  const membersRes = await request(app).get('/api/family-members').set('Authorization', `Bearer ${token}`)
  const patientId = membersRes.body.members[0].id
  const booking = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
    .send({ hospitalCode: TEST_HOSPITAL_CODE, appointmentLabel: '내일 오전 10시', patientId })
  const bookingId = booking.body.booking.id

  const username = `rhosp${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  await createStaffAccount({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username, password: 'hosp1234' })
  const staffLogin = await request(app).post('/api/auth/staff/login').send({ username, password: 'hosp1234' })
  await request(app).post(`/api/hospital/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${staffLogin.body.token}`)

  const sendRes = await request(app).post('/api/prescriptions').set('Authorization', `Bearer ${token}`)
    .send({ bookingId, pharmacyCode: TEST_PHARMACY_CODE, imageBase64: 'dGVzdA==', imageMimeType: 'image/jpeg', ...dosage })
  return sendRes.body.prescription.id
}

async function pharmacyStaffToken() {
  const username = `rpharm${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  await createStaffAccount({ role: 'pharmacy', facilityCode: TEST_PHARMACY_CODE, username, password: 'pharm1234' })
  const res = await request(app).post('/api/auth/staff/login').send({ username, password: 'pharm1234' })
  return res.body.token
}

describe('조제 완료 시 복약 알림 생성', () => {
  test('복용일수/횟수 정보가 있으면 조제완료 시 알림이 예약된다', async () => {
    const { token } = await signupTestUser(request)
    const rxId = await bookConfirmAndSendPrescription(token, { dosageTotalDays: 3, dosageTimesPerDay: 3 })
    const staffToken = await pharmacyStaffToken()

    await request(app).post(`/api/pharmacy/prescriptions/${rxId}/accept`).set('Authorization', `Bearer ${staffToken}`)
    const ready = await request(app).post(`/api/pharmacy/prescriptions/${rxId}/ready`).set('Authorization', `Bearer ${staffToken}`)
    expect(ready.status).toBe(200)

    // 스케줄 생성은 비동기(fire-and-forget)라 잠깐 대기
    await new Promise((r) => setTimeout(r, 300))

    const { rows } = await pool.query('SELECT * FROM medication_reminders WHERE prescription_id = $1', [rxId])
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => ['breakfast', 'lunch', 'dinner'].includes(r.meal))).toBe(true)
  })

  test('복용일수/횟수 정보가 없으면 알림이 생성되지 않는다', async () => {
    const { token } = await signupTestUser(request)
    const rxId = await bookConfirmAndSendPrescription(token, {})
    const staffToken = await pharmacyStaffToken()

    await request(app).post(`/api/pharmacy/prescriptions/${rxId}/accept`).set('Authorization', `Bearer ${staffToken}`)
    await request(app).post(`/api/pharmacy/prescriptions/${rxId}/ready`).set('Authorization', `Bearer ${staffToken}`)
    await new Promise((r) => setTimeout(r, 300))

    const { rows } = await pool.query('SELECT * FROM medication_reminders WHERE prescription_id = $1', [rxId])
    expect(rows.length).toBe(0)
  })

  test('발송 시각이 지난 알림은 sendDueReminders가 sent=true로 표시한다', async () => {
    const { token, user } = await signupTestUser(request)
    const rxId = await bookConfirmAndSendPrescription(token, { dosageTotalDays: 1, dosageTimesPerDay: 1 })

    // 이미 지난 시각으로 알림을 하나 직접 심어둡니다 (실제 스케줄 생성 로직과 무관하게 발송 로직만 검증)
    await pool.query(
      `INSERT INTO medication_reminders (prescription_id, user_id, meal, scheduled_at, sent)
       VALUES ($1, $2, 'dinner', now() - interval '1 minute', false)`,
      [rxId, user.id]
    )

    const result = await sendDueReminders()
    expect(result.checked).toBeGreaterThanOrEqual(1)

    const { rows } = await pool.query(
      `SELECT sent FROM medication_reminders WHERE prescription_id = $1 AND meal = 'dinner' ORDER BY id DESC LIMIT 1`,
      [rxId]
    )
    expect(rows[0].sent).toBe(true)
  })
})
