import { useEffect, useState } from 'react'
import StaffLogin from './StaffLogin.jsx'
import { staffApi, getStaffToken, clearStaffToken } from '../staffApi.js'

const STATUS_LABEL = { pending: '수락 대기', accepted: '조제 중', rejected: '거절됨', ready: '조제 완료' }
const TABS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '수락 대기' },
  { key: 'accepted', label: '조제 중' },
  { key: 'ready', label: '조제 완료' },
  { key: 'rejected', label: '거절됨' }
]

const QUICK_REASONS = ['해당 약 재고가 없어요', '처방전 정보를 확인할 수 없어요', '영업 시간이 지났어요']

export default function PharmacyDashboard() {
  const [staff, setStaff] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getStaffToken()) {
      setChecking(false)
      return
    }
    staffApi.me()
      .then((data) => {
        if (data.staff.role !== 'pharmacy') {
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
  if (!staff) return <StaffLogin roleLabel="약국" onLoggedIn={setStaff} />

  return <PrescriptionsPanel staff={staff} onLogout={handleLogout} />
}

function PrescriptionsPanel({ staff, onLogout }) {
  const [tab, setTab] = useState('pending')
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [viewingImage, setViewingImage] = useState(null) // { url, mimeType } | null
  const [imageLoadingId, setImageLoadingId] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await staffApi.pharmacyPrescriptions(tab)
      setPrescriptions(data.prescriptions)
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

  async function handleAccept(id) {
    setBusyId(id)
    try {
      await staffApi.acceptPrescription(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleReady(id) {
    setBusyId(id)
    try {
      await staffApi.readyPrescription(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmReject(id) {
    setBusyId(id)
    try {
      await staffApi.rejectPrescription(id, reason)
      setRejectingId(null)
      setReason('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleViewImage(id) {
    setImageLoadingId(id)
    try {
      const data = await staffApi.prescriptionImage(id)
      setViewingImage(`data:${data.mimeType};base64,${data.imageBase64}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setImageLoadingId(null)
    }
  }

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div>
          <h1>{staff.facilityName || '약국'} 처방전 관리</h1>
          <p className="dash-header-sub">담당자: {staff.name || staff.facilityCode}</p>
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

      {error && <p className="dash-error">{error}</p>}
      {loading ? (
        <p className="dash-empty">불러오는 중...</p>
      ) : prescriptions.length === 0 ? (
        <p className="dash-empty">해당하는 처방전이 없어요</p>
      ) : (
        <div className="dash-list">
          {prescriptions.map((p) => (
            <div className="dash-card" key={p.id}>
              <div className="dash-card-main">
                <div className="dash-card-title">
                  {p.patient_name} <span className={`dash-badge dash-badge-${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span>
                </div>
                <div className="dash-card-detail">
                  {p.hospital_name || '병원 정보 없음'} {p.appointment_label ? `· ${p.appointment_label}` : ''}
                </div>
                <div className="dash-card-sub">
                  {p.patient_name !== p.account_name && `예약자: ${p.account_name} · `}
                  {p.patient_phone || '연락처 미등록'}
                </div>
                {p.status === 'rejected' && p.reject_reason && (
                  <div className="dash-reject-reason">거절 사유: {p.reject_reason}</div>
                )}
                {p.has_image && (
                  <button
                    type="button"
                    className="dash-chip"
                    style={{ marginTop: 8 }}
                    disabled={imageLoadingId === p.id}
                    onClick={() => handleViewImage(p.id)}
                  >
                    {imageLoadingId === p.id ? '불러오는 중...' : '📷 처방전 사진 보기'}
                  </button>
                )}
              </div>

              {p.status === 'pending' && rejectingId !== p.id && (
                <div className="dash-card-actions">
                  <button className="dash-btn-confirm" disabled={busyId === p.id} onClick={() => handleAccept(p.id)}>
                    수락
                  </button>
                  <button className="dash-btn-reject" disabled={busyId === p.id} onClick={() => setRejectingId(p.id)}>
                    거절
                  </button>
                </div>
              )}

              {p.status === 'pending' && rejectingId === p.id && (
                <div className="dash-reject-form">
                  <div className="dash-reject-quick">
                    {QUICK_REASONS.map((r) => (
                      <button key={r} type="button" className="dash-chip" onClick={() => setReason(r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    className="dash-input"
                    placeholder="거절 사유 입력"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="dash-card-actions">
                    <button className="dash-btn-reject" disabled={busyId === p.id} onClick={() => confirmReject(p.id)}>
                      거절 확정
                    </button>
                    <button className="dash-btn-ghost" onClick={() => { setRejectingId(null); setReason('') }}>
                      취소
                    </button>
                  </div>
                </div>
              )}

              {p.status === 'accepted' && (
                <div className="dash-card-actions">
                  <button className="dash-btn-confirm" disabled={busyId === p.id} onClick={() => handleReady(p.id)}>
                    조제 완료 처리
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingImage && (
        <div className="image-modal-backdrop" onClick={() => setViewingImage(null)}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <img src={viewingImage} alt="처방전 사진" />
            <button className="dash-btn-ghost" onClick={() => setViewingImage(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
