import { createApp } from '../app.js'
import { pool, initDb } from '../db.js'

export const app = createApp()

export const TEST_HOSPITAL_CODE = 'TEST_HOSPITAL_1'
export const TEST_PHARMACY_CODE = 'TEST_PHARMACY_1'
export const TEST_PHARMACY_CODE_2 = 'TEST_PHARMACY_2'

export async function setupTestDb() {
  await initDb()
}

export async function closeTestDb() {
  await pool.end()
}

// 트랜잭션성 테이블만 비웁니다 (hospitals/pharmacies/hospital_departments는
// 실제 시드 데이터를 담고 있을 수 있어 건드리지 않아요. 테스트 시설은 별도 코드로 upsert합니다)
export async function resetTransactionalTables() {
  await pool.query(`
    TRUNCATE TABLE
      notification_log,
      hospital_reviews,
      pharmacy_reviews,
      facility_applications,
      hospital_schedule_exceptions,
      prescriptions,
      bookings,
      family_members,
      staff_accounts,
      password_reset_codes,
      otp_codes,
      users
    RESTART IDENTITY CASCADE
  `)
}

export async function seedTestFacilities() {
  await pool.query(
    `INSERT INTO hospitals (code, name, type, sido, sigungu, address, phone, lat, lng)
     VALUES ($1, '테스트내과의원', '의원', '서울', '중구', '서울 중구 테스트로 1', '02-000-0000', 37.5665, 126.9780)
     ON CONFLICT (code) DO NOTHING`,
    [TEST_HOSPITAL_CODE]
  )
  await pool.query(
    `INSERT INTO pharmacies (code, name, sido, sigungu, address, phone, lat, lng)
     VALUES ($1, '테스트약국', '서울', '중구', '서울 중구 테스트로 2', '02-111-1111', 37.5665, 126.9780)
     ON CONFLICT (code) DO NOTHING`,
    [TEST_PHARMACY_CODE]
  )
  await pool.query(
    `INSERT INTO pharmacies (code, name, sido, sigungu, address, phone, lat, lng)
     VALUES ($1, '테스트약국2', '서울', '중구', '서울 중구 테스트로 3', '02-222-2222', 37.5665, 126.9780)
     ON CONFLICT (code) DO NOTHING`,
    [TEST_PHARMACY_CODE_2]
  )
}

// 이메일 회원가입 + 로그인까지 한 번에 처리하고 토큰/유저 정보를 반환
export async function signupTestUser(request, overrides = {}) {
  const email = overrides.email || `user${Date.now()}${Math.random().toString(36).slice(2)}@test.com`
  const res = await request(app)
    .post('/api/auth/email/signup')
    .send({
      name: overrides.name || '테스트유저',
      email,
      password: overrides.password || 'pass1234',
      agreeTerms: true,
      agreePrivacy: true
    })
  return { token: res.body.token, user: res.body.user, email }
}

export async function createStaffAccount({ role, facilityCode, username, password, name }) {
  const bcrypt = (await import('bcryptjs')).default
  const passwordHash = await bcrypt.hash(password, 10)
  let facilityName = null
  if (facilityCode) {
    const table = role === 'hospital' ? 'hospitals' : 'pharmacies'
    const { rows } = await pool.query(`SELECT name FROM ${table} WHERE code = $1`, [facilityCode])
    facilityName = rows[0]?.name || null
  }
  await pool.query(
    `INSERT INTO staff_accounts (role, facility_code, facility_name, username, password_hash, name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [role, facilityCode || null, facilityName, username, passwordHash, name || null]
  )
}
