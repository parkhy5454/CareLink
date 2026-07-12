import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app, setupTestDb, closeTestDb, resetTransactionalTables, seedTestFacilities } from './helpers.js'

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

describe('이메일 회원가입/로그인', () => {
  test('약관 동의 없이 가입하면 400', async () => {
    const res = await request(app)
      .post('/api/auth/email/signup')
      .send({ name: '홍길동', email: 'noconsent@test.com', password: 'pass1234' })
    expect(res.status).toBe(400)
  })

  test('약관 동의하면 가입 성공하고 토큰을 받는다', async () => {
    const res = await request(app)
      .post('/api/auth/email/signup')
      .send({ name: '홍길동', email: 'consent@test.com', password: 'pass1234', agreeTerms: true, agreePrivacy: true })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe('consent@test.com')
  })

  test('같은 이메일로 중복 가입하면 409', async () => {
    await request(app).post('/api/auth/email/signup')
      .send({ name: 'A', email: 'dup@test.com', password: 'pass1234', agreeTerms: true, agreePrivacy: true })
    const res = await request(app).post('/api/auth/email/signup')
      .send({ name: 'B', email: 'dup@test.com', password: 'pass1234', agreeTerms: true, agreePrivacy: true })
    expect(res.status).toBe(409)
  })

  test('가입 시 본인 가족 프로필이 자동 생성된다', async () => {
    const { token } = await createUser()
    const res = await request(app).get('/api/family-members').set('Authorization', `Bearer ${token}`)
    expect(res.body.members).toHaveLength(1)
    expect(res.body.members[0].relationship).toBe('본인')
  })

  test('틀린 비밀번호로 로그인하면 401', async () => {
    await request(app).post('/api/auth/email/signup')
      .send({ name: 'A', email: 'login@test.com', password: 'correct123', agreeTerms: true, agreePrivacy: true })
    const res = await request(app).post('/api/auth/email/login').send({ email: 'login@test.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  test('맞는 비밀번호로 로그인 성공', async () => {
    await request(app).post('/api/auth/email/signup')
      .send({ name: 'A', email: 'login2@test.com', password: 'correct123', agreeTerms: true, agreePrivacy: true })
    const res = await request(app).post('/api/auth/email/login').send({ email: 'login2@test.com', password: 'correct123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
  })

  test('토큰 없이 /me 조회하면 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})

describe('비밀번호 재설정', () => {
  test('가입된 이메일이면 demoCode와 함께 재설정 코드가 발급된다', async () => {
    await request(app).post('/api/auth/email/signup')
      .send({ name: 'A', email: 'reset@test.com', password: 'oldpass1', agreeTerms: true, agreePrivacy: true })
    const res = await request(app).post('/api/auth/email/forgot-password').send({ email: 'reset@test.com' })
    expect(res.status).toBe(200)
    expect(res.body.demoCode).toMatch(/^\d{6}$/)
  })

  test('코드로 비밀번호를 바꾸면 새 비밀번호로만 로그인된다', async () => {
    await request(app).post('/api/auth/email/signup')
      .send({ name: 'A', email: 'reset2@test.com', password: 'oldpass1', agreeTerms: true, agreePrivacy: true })
    const forgot = await request(app).post('/api/auth/email/forgot-password').send({ email: 'reset2@test.com' })
    const code = forgot.body.demoCode

    const resetRes = await request(app)
      .post('/api/auth/email/reset-password')
      .send({ email: 'reset2@test.com', code, newPassword: 'newpass1' })
    expect(resetRes.status).toBe(200)

    const oldLogin = await request(app).post('/api/auth/email/login').send({ email: 'reset2@test.com', password: 'oldpass1' })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(app).post('/api/auth/email/login').send({ email: 'reset2@test.com', password: 'newpass1' })
    expect(newLogin.status).toBe(200)
  })

  test('존재하지 않는 이메일도 200을 반환한다 (이메일 존재 여부 유출 방지)', async () => {
    const res = await request(app).post('/api/auth/email/forgot-password').send({ email: 'nobody@test.com' })
    expect(res.status).toBe(200)
    expect(res.body.demoCode).toBeUndefined()
  })
})

describe('회원 탈퇴', () => {
  test('비밀번호가 틀리면 탈퇴 실패', async () => {
    const { token } = await createUser({ email: 'del@test.com', password: 'pass1234' })
    const res = await request(app).delete('/api/auth/me').set('Authorization', `Bearer ${token}`).send({ password: 'wrong' })
    expect(res.status).toBe(401)
  })

  test('맞는 비밀번호로 탈퇴하면 이후 /me 조회가 실패한다', async () => {
    const { token } = await createUser({ email: 'del2@test.com', password: 'pass1234' })
    const del = await request(app).delete('/api/auth/me').set('Authorization', `Bearer ${token}`).send({ password: 'pass1234' })
    expect(del.status).toBe(200)

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(404)
  })
})

async function createUser({ email, password } = {}) {
  const uniqueEmail = email || `u${Date.now()}${Math.random().toString(36).slice(2)}@test.com`
  const res = await request(app).post('/api/auth/email/signup').send({
    name: '테스트유저', email: uniqueEmail, password: password || 'pass1234', agreeTerms: true, agreePrivacy: true
  })
  return { token: res.body.token, user: res.body.user }
}
