import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend
} from 'recharts'
import StaffLogin from './StaffLogin.jsx'
import { staffApi, getStaffToken, clearStaffToken } from '../staffApi.js'

export default function AdminDashboard() {
  const [staff, setStaff] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getStaffToken()) {
      setChecking(false)
      return
    }
    staffApi.me()
      .then((data) => {
        if (data.staff.role !== 'admin') {
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
  if (!staff) return <StaffLogin roleLabel="관리자" onLoggedIn={setStaff} />

  return <AdminPanel staff={staff} onLogout={handleLogout} />
}

const TABS = [
  { key: 'stats', label: '현황' },
  { key: 'applications', label: '입점 신청' },
  { key: 'staff', label: '담당자 계정' },
  { key: 'bookings', label: '예약 내역' },
  { key: 'prescriptions', label: '처방전 내역' },
  { key: 'notifications', label: '알림 이력' }
]

function AdminPanel({ staff, onLogout }) {
  const [tab, setTab] = useState('stats')

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div>
          <h1>내건강 관리자</h1>
          <p className="dash-header-sub">담당자: {staff.name || staff.username}</p>
        </div>
        <button className="dash-btn-ghost" onClick={onLogout}>로그아웃</button>
      </header>

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

      {tab === 'stats' && <StatsPanel />}
      {tab === 'applications' && <ApplicationsPanel />}
      {tab === 'staff' && <StaffPanel />}
      {tab === 'bookings' && <BookingsPanel />}
      {tab === 'prescriptions' && <PrescriptionsPanel />}
      {tab === 'notifications' && <NotificationsPanel />}
    </div>
  )
}

function StatsPanel() {
  const [stats, setStats] = useState(null)
  const [series, setSeries] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    staffApi.adminStats().then(setStats).catch((err) => setError(err.message))
    staffApi.adminTimeseries(14).then((d) => setSeries(d.series)).catch(() => {})
  }, [])

  if (error) return <p className="dash-error">{error}</p>
  if (!stats) return <p className="dash-empty">불러오는 중...</p>

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="가입자 수" value={stats.totalUsers} />
        <StatCard label="병원 수 (전국)" value={stats.totalHospitals.toLocaleString()} />
        <StatCard label="약국 수 (전국)" value={stats.totalPharmacies.toLocaleString()} />
      </div>

      <div className="dash-card" style={{ marginTop: 12 }}>
        <div className="dash-card-title">최근 14일 추이</div>
        {series && series.some((d) => d.bookings > 0 || d.prescriptions > 0) ? (
          <div style={{ width: '100%', height: 220, marginTop: 8 }}>
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEF" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="bookings" name="예약" stroke="#3D7FF2" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="prescriptions" name="처방전" stroke="#12C79A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="dash-card-sub">아직 표시할 데이터가 없어요</p>
        )}
      </div>

      <div className="dash-card" style={{ marginTop: 12 }}>
        <div className="dash-card-title">예약 현황</div>
        <StatusChart data={stats.bookingsByStatus} labels={{ pending: '대기중', confirmed: '확정', rejected: '거절', cancelled: '취소' }} color="#3D7FF2" />
      </div>

      <div className="dash-card" style={{ marginTop: 12 }}>
        <div className="dash-card-title">처방전 현황</div>
        <StatusChart data={stats.prescriptionsByStatus} labels={{ pending: '대기중', accepted: '조제중', ready: '완료', rejected: '거절' }} color="#12C79A" />
      </div>

      <div className="dash-card" style={{ marginTop: 12 }}>
        <div className="dash-card-title">담당자 계정</div>
        <StatusBreakdown data={stats.staffByRole} labels={{ hospital: '병원', pharmacy: '약국', admin: '관리자' }} />
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function StatusChart({ data, labels, color }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return <p className="dash-card-sub">데이터가 없어요</p>
  const chartData = entries.map(([key, count]) => ({ name: labels[key] || key, count }))
  return (
    <div style={{ width: '100%', height: 160, marginTop: 8 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEF" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" fill={color} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatusBreakdown({ data, labels }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return <p className="dash-card-sub">데이터가 없어요</p>
  return (
    <div className="status-breakdown">
      {entries.map(([key, count]) => (
        <div key={key} className="status-breakdown-row">
          <span>{labels[key] || key}</span>
          <b>{count}</b>
        </div>
      ))}
    </div>
  )
}

function ApplicationsPanel() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await staffApi.adminApplications()
      setApplications(data.applications)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleApprove(id) {
    if (!username || password.length < 6) {
      setError('발급할 아이디와 6자 이상의 비밀번호를 입력해주세요')
      return
    }
    setBusyId(id)
    setError('')
    try {
      await staffApi.adminApproveApplication(id, username, password)
      setApprovingId(null)
      setUsername('')
      setPassword('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id) {
    setBusyId(id)
    try {
      await staffApi.adminRejectApplication(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && applications.length === 0) return <p className="dash-error">{error}</p>
  if (loading) return <p className="dash-empty">불러오는 중...</p>
  if (applications.length === 0) return <p className="dash-empty">입점 신청이 없어요</p>

  return (
    <div className="dash-list">
      {applications.map((a) => (
        <div className="dash-card" key={a.id}>
          <div className="dash-card-main">
            <div className="dash-card-title">
              {a.facility_name} <span className={`dash-badge dash-badge-${a.status === 'pending' ? 'pending' : a.status === 'approved' ? 'confirmed' : 'rejected'}`}>
                {a.role === 'hospital' ? '병원' : '약국'} · {a.status === 'pending' ? '대기' : a.status === 'approved' ? '승인됨' : '거절됨'}
              </span>
            </div>
            <div className="dash-card-detail">담당자: {a.contact_name} · {a.contact_phone}{a.contact_email ? ` · ${a.contact_email}` : ''}</div>
            {a.note && <div className="dash-card-sub">{a.note}</div>}
          </div>

          {a.status === 'pending' && approvingId !== a.id && (
            <div className="dash-card-actions">
              <button className="dash-btn-confirm" onClick={() => setApprovingId(a.id)}>승인</button>
              <button className="dash-btn-reject" disabled={busyId === a.id} onClick={() => handleReject(a.id)}>거절</button>
            </div>
          )}

          {a.status === 'pending' && approvingId === a.id && (
            <div className="member-add-form">
              <input className="dash-input" placeholder="발급할 아이디" value={username} onChange={(e) => setUsername(e.target.value)} />
              <input className="dash-input" type="password" placeholder="비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="dash-error">{error}</p>}
              <div className="dash-card-actions">
                <button className="dash-btn-confirm" disabled={busyId === a.id} onClick={() => handleApprove(a.id)}>
                  {busyId === a.id ? '처리 중...' : '승인 확정'}
                </button>
                <button className="dash-btn-ghost" onClick={() => setApprovingId(null)}>취소</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StaffPanel() {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await staffApi.adminStaffList()
      setStaffList(data.staff)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id) {
    try {
      await staffApi.adminDeleteStaff(id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <button className="dash-btn-primary" style={{ marginBottom: 14 }} onClick={() => setShowCreate((v) => !v)}>
        {showCreate ? '취소' : '+ 새 담당자 계정 만들기'}
      </button>

      {showCreate && (
        <CreateStaffForm
          onCreated={() => { setShowCreate(false); load() }}
          onError={setError}
        />
      )}

      {error && <p className="dash-error">{error}</p>}
      {loading ? (
        <p className="dash-empty">불러오는 중...</p>
      ) : staffList.length === 0 ? (
        <p className="dash-empty">등록된 담당자 계정이 없어요</p>
      ) : (
        <div className="dash-list">
          {staffList.map((s) => (
            <div className="dash-card" key={s.id}>
              <div className="dash-card-main">
                <div className="dash-card-title">
                  {s.facility_name || '관리자'} <span className="dash-badge dash-badge-confirmed">{s.role}</span>
                </div>
                <div className="dash-card-detail">아이디: {s.username}{s.name ? ` · ${s.name}` : ''}</div>
              </div>
              <div className="dash-card-actions">
                <button className="dash-btn-reject" onClick={() => handleDelete(s.id)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateStaffForm({ onCreated, onError }) {
  const [role, setRole] = useState('hospital')
  const [facilityCode, setFacilityCode] = useState('')
  const [facilityQuery, setFacilityQuery] = useState('')
  const [facilityResults, setFacilityResults] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function searchFacility() {
    if (!facilityQuery.trim()) return
    try {
      const path = role === 'hospital'
        ? `/hospitals/search?q=${encodeURIComponent(facilityQuery)}&limit=8`
        : `/pharmacies/search?q=${encodeURIComponent(facilityQuery)}&limit=8`
      const res = await fetch(`/api${path}`)
      const data = await res.json()
      setFacilityResults(role === 'hospital' ? data.hospitals : data.pharmacies)
    } catch {
      setFacilityResults([])
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await staffApi.adminCreateStaff({ role, facilityCode: facilityCode || undefined, username, password, name })
      onCreated()
    } catch (err) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="dash-card" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
      <div className="member-chips" style={{ marginBottom: 10 }}>
        {['hospital', 'pharmacy', 'admin'].map((r) => (
          <button
            type="button"
            key={r}
            className={`member-chip ${role === r ? 'active' : ''}`}
            onClick={() => { setRole(r); setFacilityCode(''); setFacilityResults([]) }}
          >
            {r === 'hospital' ? '병원' : r === 'pharmacy' ? '약국' : '관리자'}
          </button>
        ))}
      </div>

      {role !== 'admin' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="dash-input"
              style={{ flex: 1 }}
              placeholder={role === 'hospital' ? '병원 이름 검색' : '약국 이름 검색'}
              value={facilityQuery}
              onChange={(e) => setFacilityQuery(e.target.value)}
            />
            <button type="button" className="dash-btn-ghost" onClick={searchFacility}>검색</button>
          </div>
          {facilityResults.length > 0 && (
            <div className="dash-list" style={{ marginBottom: 10 }}>
              {facilityResults.map((f) => (
                <button
                  type="button"
                  key={f.code}
                  className={`dash-chip ${facilityCode === f.code ? 'active' : ''}`}
                  style={{ textAlign: 'left', marginBottom: 6 }}
                  onClick={() => setFacilityCode(f.code)}
                >
                  {f.name} ({f.sido} {f.sigungu})
                </button>
              ))}
            </div>
          )}
          {facilityCode && <p className="dash-card-sub">선택된 시설 코드: {facilityCode.slice(0, 12)}...</p>}
        </>
      )}

      <input className="dash-input" style={{ marginTop: 8 }} placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input className="dash-input" style={{ marginTop: 8 }} type="password" placeholder="비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="dash-input" style={{ marginTop: 8 }} placeholder="담당자 이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} />

      <button className="dash-btn-primary" style={{ marginTop: 10 }} type="submit" disabled={submitting}>
        {submitting ? '만드는 중...' : '계정 만들기'}
      </button>
    </form>
  )
}

function BookingsPanel() {
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    staffApi.adminBookings(100).then((d) => setBookings(d.bookings)).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="dash-error">{error}</p>
  if (bookings.length === 0) return <p className="dash-empty">예약 내역이 없어요</p>

  return (
    <div className="dash-list">
      {bookings.map((b) => (
        <div className="dash-card" key={b.id}>
          <div className="dash-card-main">
            <div className="dash-card-title">
              {b.patient_name} <span className={`dash-badge dash-badge-${b.status}`}>{b.status}</span>
            </div>
            <div className="dash-card-detail">{b.hospital_name} · {b.appointment_label}</div>
            <div className="dash-card-sub">예약 계정: {b.account_name} · {new Date(b.created_at).toLocaleString('ko-KR')}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PrescriptionsPanel() {
  const [prescriptions, setPrescriptions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    staffApi.adminPrescriptions(100).then((d) => setPrescriptions(d.prescriptions)).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="dash-error">{error}</p>
  if (prescriptions.length === 0) return <p className="dash-empty">처방전 내역이 없어요</p>

  return (
    <div className="dash-list">
      {prescriptions.map((p) => (
        <div className="dash-card" key={p.id}>
          <div className="dash-card-main">
            <div className="dash-card-title">
              {p.account_name} <span className={`dash-badge dash-badge-${p.status}`}>{p.status}</span>
            </div>
            <div className="dash-card-detail">{p.pharmacy_name}</div>
            <div className="dash-card-sub">{new Date(p.created_at).toLocaleString('ko-KR')}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function NotificationsPanel() {
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    staffApi.adminNotifications(100).then((d) => setNotifications(d.notifications)).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="dash-error">{error}</p>
  if (notifications.length === 0) return <p className="dash-empty">발송된 알림이 없어요</p>

  return (
    <div className="dash-list">
      {notifications.map((n) => (
        <div className="dash-card" key={n.id}>
          <div className="dash-card-main">
            <div className="dash-card-title">
              {n.user_name || '알 수 없음'}
              <span className={`dash-badge ${n.success ? 'dash-badge-confirmed' : 'dash-badge-rejected'}`}>
                {n.channel} · {n.success ? '성공' : '실패'}
              </span>
            </div>
            <div className="dash-card-detail">{n.message}</div>
            <div className="dash-card-sub">{new Date(n.created_at).toLocaleString('ko-KR')}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
