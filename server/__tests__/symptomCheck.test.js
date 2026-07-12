import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app, setupTestDb, closeTestDb, resetTransactionalTables, seedTestFacilities, signupTestUser } from './helpers.js'

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

describe('AI 증상 체크', () => {
  test('로그인 없이 요청하면 401', async () => {
    const res = await request(app).post('/api/symptom-check').send({ symptomText: '허리가 아파요' })
    expect(res.status).toBe(401)
  })

  test('증상 텍스트가 너무 짧으면 400', async () => {
    const { token } = await signupTestUser(request)
    const res = await request(app).post('/api/symptom-check').set('Authorization', `Bearer ${token}`)
      .send({ symptomText: '' })
    expect(res.status).toBe(400)
  })

  test('텍스트는 있지만 API 키가 없으면 501', async () => {
    const { token } = await signupTestUser(request)
    const res = await request(app).post('/api/symptom-check').set('Authorization', `Bearer ${token}`)
      .send({ symptomText: '허리가 아파요' })
    expect(res.status).toBe(501)
    expect(res.body.notConfigured).toBe(true)
  })
})
