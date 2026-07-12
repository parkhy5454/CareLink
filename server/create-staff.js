import bcrypt from 'bcryptjs'
import { pool, initDb } from './db.js'

// 사용법:
//   node server/create-staff.js hospital <병원코드> <아이디> <비밀번호> [담당자이름]
//   node server/create-staff.js pharmacy <약국코드> <아이디> <비밀번호> [담당자이름]
//   node server/create-staff.js admin <아이디> <비밀번호> [담당자이름]   (관리자는 시설 코드 필요 없음)
//
// 병원코드/약국코드는 /api/hospitals/search, /api/pharmacies/search 결과의 "code" 값을 사용하세요.

async function main() {
  const role = process.argv[2]

  if (!['hospital', 'pharmacy', 'admin'].includes(role)) {
    printUsage()
    process.exit(1)
  }

  await initDb()

  if (role === 'admin') {
    const [, username, password, name] = process.argv.slice(2)
    if (!username || !password) {
      printUsage()
      process.exit(1)
    }
    const passwordHash = await bcrypt.hash(password, 10)
    await pool.query(
      `INSERT INTO staff_accounts (role, facility_code, facility_name, username, password_hash, name)
       VALUES ('admin', NULL, '관리자', $1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
      [username, passwordHash, name || null]
    )
    console.log(`[완료] 관리자 계정을 만들었어요 → 아이디: ${username}`)
    await pool.end()
    return
  }

  const [, facilityCode, username, password, name] = process.argv.slice(2)
  if (!facilityCode || !username || !password) {
    printUsage()
    process.exit(1)
  }

  const table = role === 'hospital' ? 'hospitals' : 'pharmacies'
  const { rows: facilityRows } = await pool.query(`SELECT * FROM ${table} WHERE code = $1`, [facilityCode])
  if (facilityRows.length === 0) {
    console.error(`[오류] ${role === 'hospital' ? '병원' : '약국'} 코드를 찾을 수 없어요: ${facilityCode}`)
    process.exit(1)
  }
  const facility = facilityRows[0]

  const passwordHash = await bcrypt.hash(password, 10)

  await pool.query(
    `INSERT INTO staff_accounts (role, facility_code, facility_name, username, password_hash, name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash, facility_code = EXCLUDED.facility_code,
       facility_name = EXCLUDED.facility_name, name = EXCLUDED.name`,
    [role, facilityCode, facility.name, username, passwordHash, name || null]
  )

  console.log(`[완료] ${facility.name} (${role}) 담당자 계정을 만들었어요 → 아이디: ${username}`)
  await pool.end()
}

function printUsage() {
  console.log('사용법:')
  console.log('  node server/create-staff.js hospital <병원코드> <아이디> <비밀번호> [담당자이름]')
  console.log('  node server/create-staff.js pharmacy <약국코드> <아이디> <비밀번호> [담당자이름]')
  console.log('  node server/create-staff.js admin <아이디> <비밀번호> [담당자이름]')
}

main().catch((err) => {
  console.error('[오류]', err)
  process.exit(1)
})
