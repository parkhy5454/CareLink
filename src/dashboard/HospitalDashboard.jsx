import { useEffect, useState } from 'react'
import StaffLogin from './StaffLogin.jsx'
import { staffApi, getStaffToken, clearStaffToken } from '../staffApi.js'

const STATUS_LABEL = { pending: '확인 대기', confirmed: '확정', rejected: '거절됨', cancelled: '환자 취소' }
const TABS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '확인 대기' },
  { key: 'confirmed', label: '확정' },
  { key: 'rejected', label: '거절됨' },
  { key: 'cancelled', label: '환자 취소' }
]

export default function HospitalDashboard() {
  const [staff, setStaff] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getStaffToken()) {
      setChecking(false)
      return
    }
    staffApi.me()
      .then((data) => {
        if (data.staff.role !== 'hospital') {
          clearStaffToken()
          setStaff(null)
        } else {
          setStaff(data.staff)
        }
      })
      .catch(() => clearStaffToken())
      .finally(() => setChecking(false))
  }, [])

  function handleLogout() {
    clearStaffToken()
    setStaff(null)
  }

  if (checking) return <div className="dash-loading">불러오는 중...</div>
  if (!staff) return <StaffLogin roleLabel="병원" onLoggedIn={setStaff} />

  return <HospitalPanel staff={staff} onLogout={handleLogout} />
}

function HospitalPanel({ staff, onLogout }) {
  const [section, setSection] = useState('bookings') // bookings | schedule

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div>
          <h1>{staff.facilityName || '병원'}</h1>
          <p className="dash-header-sub">담당자: {staff.name || staff.facilityCode}</p>
        </div>
        <button className="dash-btn-ghost" onClick={onLogout}>로그아웃</button>
      </header>

      <div className="dash-tabs" style={{ marginBottom: 14 }}>
        <button className={`dash-tab ${section === 'bookings' ? 'active' : ''}`} onClick={() => setSection('bookings')}>예약 관리</button>
        <button className={`dash-tab ${section === 'schedule' ? 'active' : ''}`} onClick={() => setSection('schedule')}>진료시간 설정</button>
      </div>

      {section === 'bookings' && <BookingsPanel />}
      {section === 'schedule' && <SchedulePanel />}
    </div>
  )
}

function BookingsPanel() {
  const [tab, setTab] = useState('pending')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await staffApi.hospitalBookings(tab)
      setBookings(data.bookings)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleAction(id, action) {
    setBusyId(id)
    try {
      if (action === 'confirm') await staffApi.confirmBooking(id)
      else await staffApi.rejectBooking(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="dash-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`dash-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="dash-error">{error}</p>}
      {loading ? (
        <p className="dash-empty">불러오는 중...</p>
      ) : bookings.length === 0 ? (
        <p className="dash-empty">해당하는 예약이 없어요</p>
      ) : (
        <div className="dash-list">
          {bookings.map((b) => (
            <div className="dash-card" key={b.id}>
              <div className="dash-card-main">
                <div className="dash-card-title">
                  {b.patient_name} <span className={`dash-badge dash-badge-${b.status}`}>{STATUS_LABEL[b.status] || b.status}</span>
                </div>
                <div className="dash-card-detail">{b.appointment_label} · 예약번호 {b.booking_code}</div>
                <div className="dash-card-sub">
                  {b.patient_name !== b.account_name && `예약자: ${b.account_name} · `}
                  {b.patient_phone || b.patient_email || '연락처 미등록'}
                </div>
              </div>
              {b.status === 'pending' && (
                <div className="dash-card-actions">
                  <button
                    className="dash-btn-confirm"
                    disabled={busyId === b.id}
                    onClick={() => handleAction(b.id, 'confirm')}
                  >
                    예약 확정
                  </button>
                  <button
                    className="dash-btn-reject"
                    disabled={busyId === b.id}
                    onClick={() => handleAction(b.id, 'reject')}
                  >
                    거절
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchedulePanel() {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await staffApi.hospitalSchedule()
      setDays(data.days)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function toggle(dayIdx, timeIdx) {
    setDays((prev) => {
      const next = prev.map((d) => ({ ...d, times: d.times.map((t) => ({ ...t })) }))
      next[dayIdx].times[timeIdx].enabled = !next[dayIdx].times[timeIdx].enabled
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSavedMsg('')
    try {
      const disabledLabels = days.flatMap((d) => d.times.filter((t) => !t.enabled).map((t) => t.label))
      await staffApi.saveHospitalSchedule(disabledLabels)
      setSavedMsg('저장했어요')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="dash-empty">불러오는 중...</p>

  return (
    <div>
      <p className="dash-card-sub" style={{ marginBottom: 12 }}>
        환자에게 보여줄 예약 가능 시간을 켜고 끌 수 있어요. 끈 시간은 환자 화면에 아예 표시되지 않아요.
      </p>
      {days.map((d, dayIdx) => (
        <div key={d.day} className="dash-card" style={{ marginBottom: 10 }}>
          <div className="dash-card-title" style={{ marginBottom: 8 }}>{d.day}</div>
          <div className="slot-grid">
            {d.times.map((t, timeIdx) => (
              <button
                key={t.label}
                type="button"
                className={`slot-btn ${!t.enabled ? 'taken' : ''}`}
                onClick={() => toggle(dayIdx, timeIdx)}
              >
                {t.time} {t.enabled ? '' : '· 휴진'}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="dash-error">{error}</p>}
      {savedMsg && <p className="dash-card-sub" style={{ color: '#0A8F70', fontWeight: 700 }}>{savedMsg}</p>}
      <button className="dash-btn-primary" style={{ width: '100%' }} onClick={handleSave} disabled={saving}>
        {saving ? '저장 중...' : '저장하기'}
      </button>
    </div>
  )
}
