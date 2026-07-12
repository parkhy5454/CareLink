import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse'
import { pool, initDb } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')

const BATCH_SIZE = 1000

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = []
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject)
  })
}

function toNumOrNull(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function seedHospitals() {
  const rows = await readCsv(path.join(DATA_DIR, 'hospitals.csv'))
  console.log(`[seed] 병원 ${rows.length}건 적재 시작...`)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const values = []
    const params = []
    batch.forEach((r, idx) => {
      const base = idx * 9
      values.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`
      )
      params.push(
        r.code, r.name, r.type, r.sido, r.sigungu, r.address, r.phone || null,
        toNumOrNull(r.lat), toNumOrNull(r.lng)
      )
    })
    await pool.query(
      `INSERT INTO hospitals (code, name, type, sido, sigungu, address, phone, lat, lng)
       VALUES ${values.join(',')}
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type, sido = EXCLUDED.sido,
         sigungu = EXCLUDED.sigungu, address = EXCLUDED.address, phone = EXCLUDED.phone,
         lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
      params
    )
    process.stdout.write(`\r[seed] 병원 ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }
  console.log('\n[seed] 병원 적재 완료')
}

async function seedPharmacies() {
  const rows = await readCsv(path.join(DATA_DIR, 'pharmacies.csv'))
  console.log(`[seed] 약국 ${rows.length}건 적재 시작...`)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const values = []
    const params = []
    batch.forEach((r, idx) => {
      const base = idx * 8
      values.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`
      )
      params.push(
        r.code, r.name, r.sido, r.sigungu, r.address, r.phone || null,
        toNumOrNull(r.lat), toNumOrNull(r.lng)
      )
    })
    await pool.query(
      `INSERT INTO pharmacies (code, name, sido, sigungu, address, phone, lat, lng)
       VALUES ${values.join(',')}
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name, sido = EXCLUDED.sido, sigungu = EXCLUDED.sigungu,
         address = EXCLUDED.address, phone = EXCLUDED.phone, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
      params
    )
    process.stdout.write(`\r[seed] 약국 ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }
  console.log('\n[seed] 약국 적재 완료')
}

async function seedDepartments() {
  const rows = await readCsv(path.join(DATA_DIR, 'hospital_departments.csv'))
  console.log(`[seed] 진료과목 매핑 ${rows.length}건 적재 시작...`)

  // 존재하는 병원 코드만 남기기 (참조 무결성 오류 방지)
  const { rows: codeRows } = await pool.query('SELECT code FROM hospitals')
  const validCodes = new Set(codeRows.map((r) => r.code))
  const filtered = rows.filter((r) => validCodes.has(r.hospital_code) && r.dept_name)

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE)
    const values = []
    const params = []
    batch.forEach((r, idx) => {
      const base = idx * 2
      values.push(`($${base + 1},$${base + 2})`)
      params.push(r.hospital_code, r.dept_name)
    })
    await pool.query(
      `INSERT INTO hospital_departments (hospital_code, dept_name)
       VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      params
    )
    process.stdout.write(`\r[seed] 진료과목 ${Math.min(i + BATCH_SIZE, filtered.length)}/${filtered.length}`)
  }
  console.log('\n[seed] 진료과목 적재 완료')
}

async function main() {
  await initDb()
  await seedHospitals()
  await seedPharmacies()
  await seedDepartments()
  console.log('[seed] 전체 완료!')
  await pool.end()
}

main().catch((err) => {
  console.error('[seed] 실패:', err)
  process.exit(1)
})
