import { Router } from 'express'
import { pool } from './db.js'
import { DAY_LABELS, TIME_LABELS } from './slots.js'

const router = Router()

function parseLatLng(req) {
  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  return null
}

// 병원 검색: 이름/주소로 검색, 시도/진료과목으로 필터 가능, lat/lng을 주면 가까운 순으로 정렬
router.get('/hospitals/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const sido = String(req.query.sido || '').trim()
    const dept = String(req.query.dept || '').trim()
    const limit = Math.min(parseInt(req.query.limit) || 20, 50)
    const coords = parseLatLng(req)

    const conditions = []
    const params = []

    if (q) {
      params.push(`%${q}%`)
      conditions.push(`(h.name ILIKE $${params.length} OR h.address ILIKE $${params.length})`)
    }
    if (sido) {
      params.push(sido)
      conditions.push(`h.sido = $${params.length}`)
    }
    if (coords) {
      conditions.push('h.lat IS NOT NULL AND h.lng IS NOT NULL')
    }

    let joinClause = ''
    if (dept) {
      params.push(dept)
      joinClause = `JOIN hospital_departments hd ON hd.hospital_code = h.code AND hd.dept_name = $${params.length}`
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    let distanceSelect = 'NULL AS distance_km'
    let orderClause = 'ORDER BY h.name'
    if (coords) {
      params.push(coords.lat, coords.lng)
      const latIdx = params.length - 1
      const lngIdx = params.length
      distanceSelect = `(
        6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians($${latIdx})) * cos(radians(h.lat)) * cos(radians(h.lng) - radians($${lngIdx}))
            + sin(radians($${latIdx})) * sin(radians(h.lat))
          ))
        )
      ) AS distance_km`
      orderClause = 'ORDER BY distance_km ASC'
    }

    params.push(limit)

    const { rows } = await pool.query(
      `SELECT DISTINCT h.code, h.name, h.type, h.sido, h.sigungu, h.address, h.phone, h.lat, h.lng, ${distanceSelect}
       FROM hospitals h
       ${joinClause}
       ${whereClause}
       ${orderClause}
       LIMIT $${params.length}`,
      params
    )

    res.json({ hospitals: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '병원 검색 중 문제가 발생했어요' })
  }
})

router.get('/hospitals/:code/slots', async (req, res) => {
  try {
    const { rows: hospitalRows } = await pool.query('SELECT code, name FROM hospitals WHERE code = $1', [req.params.code])
    if (hospitalRows.length === 0) {
      return res.status(404).json({ error: '병원을 찾을 수 없어요' })
    }

    const { rows: takenRows } = await pool.query(
      `SELECT appointment_label FROM bookings WHERE hospital_code = $1 AND status IN ('pending', 'confirmed')`,
      [req.params.code]
    )
    const taken = new Set(takenRows.map((r) => r.appointment_label))

    const { rows: disabledRows } = await pool.query(
      'SELECT slot_label FROM hospital_schedule_exceptions WHERE hospital_code = $1',
      [req.params.code]
    )
    const disabled = new Set(disabledRows.map((r) => r.slot_label))

    const days = DAY_LABELS.map((day) => ({
      day,
      times: TIME_LABELS.map((time) => {
        const label = `${day} ${time}`
        return { time, label, taken: taken.has(label) }
      }).filter((t) => !disabled.has(t.label)) // 병원이 진료시간에서 꺼둔 슬롯은 아예 안 보여줌
    })).filter((d) => d.times.length > 0)

    res.json({ hospital: hospitalRows[0], days })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '예약 가능 시간을 불러오는 중 문제가 발생했어요' })
  }
})

router.get('/hospitals/:code', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM hospitals WHERE code = $1', [req.params.code])
    if (rows.length === 0) return res.status(404).json({ error: '병원을 찾을 수 없어요' })

    const { rows: depts } = await pool.query(
      'SELECT dept_name FROM hospital_departments WHERE hospital_code = $1 ORDER BY dept_name',
      [req.params.code]
    )

    res.json({ hospital: rows[0], departments: depts.map((d) => d.dept_name) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '병원 정보를 불러오는 중 문제가 발생했어요' })
  }
})

// 약국 검색 (이름/주소, 지역, lat/lng을 주면 가까운 순으로 정렬)
router.get('/pharmacies/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const sido = String(req.query.sido || '').trim()
    const sigungu = String(req.query.sigungu || '').trim()
    const limit = Math.min(parseInt(req.query.limit) || 20, 50)
    const coords = parseLatLng(req)

    const conditions = []
    const params = []

    if (q) {
      params.push(`%${q}%`)
      conditions.push(`(name ILIKE $${params.length} OR address ILIKE $${params.length})`)
    }
    if (sido) {
      params.push(sido)
      conditions.push(`sido = $${params.length}`)
    }
    if (sigungu) {
      params.push(sigungu)
      conditions.push(`sigungu = $${params.length}`)
    }
    if (coords) {
      conditions.push('lat IS NOT NULL AND lng IS NOT NULL')
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    let distanceSelect = 'NULL AS distance_km'
    let orderClause = 'ORDER BY name'
    if (coords) {
      params.push(coords.lat, coords.lng)
      const latIdx = params.length - 1
      const lngIdx = params.length
      distanceSelect = `(
        6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians($${latIdx})) * cos(radians(lat)) * cos(radians(lng) - radians($${lngIdx}))
            + sin(radians($${latIdx})) * sin(radians(lat))
          ))
        )
      ) AS distance_km`
      orderClause = 'ORDER BY distance_km ASC'
    }

    params.push(limit)

    const { rows } = await pool.query(
      `SELECT code, name, sido, sigungu, address, phone, lat, lng, ${distanceSelect}
       FROM pharmacies
       ${whereClause}
       ${orderClause}
       LIMIT $${params.length}`,
      params
    )

    res.json({ pharmacies: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '약국 검색 중 문제가 발생했어요' })
  }
})

// 진료과목 전체 목록 (검색 필터용 드롭다운에 사용)
router.get('/departments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dept_name, COUNT(*) AS hospital_count
       FROM hospital_departments
       GROUP BY dept_name
       ORDER BY hospital_count DESC
       LIMIT 40`
    )
    res.json({ departments: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '진료과목 목록을 불러오는 중 문제가 발생했어요' })
  }
})

export default router
