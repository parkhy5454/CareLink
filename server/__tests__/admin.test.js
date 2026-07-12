import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import {
  app, setupTestDb, closeTestDb, resetTransactionalTables, seedTestFacilities,
  createStaffAccount, TEST_HOSPITAL_CODE
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

async function adminToken(username = 'admintest') {
  await createStaffAccount({ role: 'admin', facilityCode: null, username, password: 'admin1234' })
  const res = await request(app).post('/api/auth/staff/login').send({ username, password: 'admin1234' })
  return res.body.token
}

describe('관리자 - 담당자 계정 관리', () => {
  test('관리자가 아닌 계정은 admin API에 접근할 수 없다', async () => {
    await createStaffAccount({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'nothing', password: 'pass1234' })
    const login = await request(app).post('/api/auth/staff/login').send({ username: 'nothing', password: 'pass1234' })
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${login.body.token}`)
    expect(res.status).toBe(403)
  })

  test('관리자가 병원 담당자 계정을 생성하면 바로 로그인할 수 있다', async () => {
    const token = await adminToken()
    const create = await request(app).post('/api/admin/staff-accounts').set('Authorization', `Bearer ${token}`)
      .send({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'newhosp', password: 'newpass1' })
    expect(create.status).toBe(200)

    const login = await request(app).post('/api/auth/staff/login').send({ username: 'newhosp', password: 'newpass1' })
    expect(login.status).toBe(200)
    expect(login.body.staff.role).toBe('hospital')
  })

  test('이미 존재하는 아이디로 만들면 409', async () => {
    const token = await adminToken()
    await request(app).post('/api/admin/staff-accounts').set('Authorization', `Bearer ${token}`)
      .send({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'dupacct', password: 'pass1234' })
    const second = await request(app).post('/api/admin/staff-accounts').set('Authorization', `Bearer ${token}`)
      .send({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, username: 'dupacct', password: 'pass1234' })
    expect(second.status).toBe(409)
  })
})

describe('관리자 - 입점 신청 승인', () => {
  test('신청 제출 -> 관리자 승인 -> 계정 로그인까지 전체 흐름', async () => {
    const submit = await request(app).post('/api/facility-applications')
      .send({
        role: 'hospital',
        facilityCode: TEST_HOSPITAL_CODE,
        contactName: '김원장',
        contactPhone: '01011112222'
      })
    expect(submit.status).toBe(200)
    const appId = submit.body.application.id

    const token = await adminToken()
    const approve = await request(app).post(`/api/admin/applications/${appId}/approve`).set('Authorization', `Bearer ${token}`)
      .send({ username: 'approvedhosp', password: 'approved1' })
    expect(approve.status).toBe(200)
    expect(approve.body.application.status).toBe('approved')

    const login = await request(app).post('/api/auth/staff/login').send({ username: 'approvedhosp', password: 'approved1' })
    expect(login.status).toBe(200)
  })

  test('존재하지 않는 시설 코드로 신청하면 404', async () => {
    const res = await request(app).post('/api/facility-applications')
      .send({ role: 'hospital', facilityCode: 'NOPE', contactName: '테스트', contactPhone: '01000000000' })
    expect(res.status).toBe(404)
  })

  test('거절된 신청은 승인할 수 없다', async () => {
    const submit = await request(app).post('/api/facility-applications')
      .send({ role: 'hospital', facilityCode: TEST_HOSPITAL_CODE, contactName: '김원장', contactPhone: '01011112222' })
    const appId = submit.body.application.id

    const token = await adminToken()
    await request(app).post(`/api/admin/applications/${appId}/reject`).set('Authorization', `Bearer ${token}`)

    const approve = await request(app).post(`/api/admin/applications/${appId}/approve`).set('Authorization', `Bearer ${token}`)
      .send({ username: 'x', password: 'password1' })
    expect(approve.status).toBe(404)
  })
})
