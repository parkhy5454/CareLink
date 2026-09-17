import { useEffect, useState } from 'react'
import { api, clearToken } from '../api.js'
import { isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '../utils/push.js'

const STATUS_LABELS = {
  visit: { pending: '예약 대기', confirmed: '예약 확정', rejected: '예약 거절', cancelled: '예약 취소' },
  prescription: { pending: '접수 대기', accepted: '조제 중', ready: '조제 완료', rejected: '처방 거절' }
}
const RELATIONSHIP_OPTIONS = ['자녀', '배우자', '부모님', '형제자매', '기타']

export default function MyInfo({ user, onLoggedOut }) {
  const [tab, setTab] = useState('history') // history | family | account
  const [members, setMembers] = useState([])

  function loadMembers() {
    return api.familyMembers().then((data) => setMembers(data.members)).catch(() => {})
  }

  useEffect(() => { loadMembers() }, [])

  return (
    <>
      <div className="statusbar">
        <span>9:41</span>
        <div className="icons">
          <div className="bars"><i></i><i></i><i></i><i></i></div>
          <div className="batt"><div className="batt-fill"></div></div>
        </div>
      </div>
      <div className="screen">
        <div className="home">
          <div className="home-header">
            <div className="home-brand"><span className="dot"></span>내 정보</div>
            <div className="home-user">{user?.name || '회원'} 님</div>
          </div>

          <div className="method-tabs" style={{ marginBottom: 16 }}>
            <button type="button" className={`method-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>기록</button>
            <button type="button" className={`method-tab ${tab === 'family' ? 'active' : ''}`} onClick={() => setTab('family')}>가족 관리</button>
            <button type="button" className={`method-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>계정</button>
          </div>

          {tab === 'history' && <HistoryTab members={members} />}
          {tab === 'family' && <FamilyTab members={members} onChange={loadMembers} />}
          {tab === 'account' && <AccountTab user={user} onLoggedOut={onLoggedOut} />}
        </div>
      </div>
    </>
  )
}

function HistoryTab({ members }) {
  const [selected, setSelected] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.history(selected || null)
      .then((data) => setRecords(data.records))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selected])

  return (
    <>
      <div className="section-label">누구의 기록을 볼까요?</div>
      <div className="member-chips">
        <button type="button" className={`member-chip ${selected === '' ? 'active' : ''}`} onClick={() => setSelected('')}>전체</button>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`member-chip ${selected === String(m.id) ? 'active' : ''}`}
            onClick={() => setSelected(String(m.id))}
          >
            {m.name} <span>{m.relationship}</span>
          </button>
        ))}
      </div>

      <div className="section-label">진료·처방 내역</div>
      {loading ? (
        <p className="search-status">불러오는 중...</p>
      ) : records.length === 0 ? (
        <p className="search-status">아직 기록이 없어요</p>
      ) : (
        <div className="timeline">
          {records.map((r) => (
            <TimelineItem key={`${r.record_type}-${r.id}`} record={r} />
          ))}
        </div>
      )}
    </>
  )
}

function TimelineItem({ record }) {
  const [showReview, setShowReview] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const date = new Date(record.created_at)
  const dateLabel = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const isVisit = record.record_type === 'visit'
  const statusLabel = STATUS_LABELS[record.record_type]?.[record.status] || record.status

  const canReview = record.facility_code && (
    (isVisit && record.status === 'confirmed') || (!isVisit && record.status === 'ready')
  )

  async function submitReview() {
    setSubmitting(true)
    setError('')
    try {
      if (isVisit) {
        await api.addHospitalReview(record.facility_code, rating, comment, record.id)
      } else {
        await api.addPharmacyReview(record.facility_code, rating, comment, record.id)
      }
      setDone(true)
      setShowReview(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="timeline-item">
      <div className={`timeline-icon ${isVisit ? 'visit' : 'rx'}`}>{isVisit ? '진료' : '처방'}</div>
      <div className="timeline-body">
        <div className="timeline-top">
          <span className="timeline-title">{record.facility_name || '이름 없음'}</span>
          <span className={`dash-badge dash-badge-${record.status}`}>{statusLabel}</span>
        </div>
        <div className="timeline-sub">
          {record.patient_name || '환자'} 님
          {record.detail ? ` · ${record.detail}` : ''}
        </div>
        {record.status === 'rejected' && record.reject_reason && (
          <div className="timeline-reason">사유: {record.reject_reason}</div>
        )}
        <div className="timeline-date">{dateLabel}</div>

        {canReview && !done && (
          <>
            {!showReview ? (
              <button type="button" className="review-btn" onClick={() => setShowReview(true)}>리뷰 남기기</button>
            ) : (
              <div className="review-form">
                <div className="review-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`star-btn ${n <= rating ? 'filled' : ''}`}
                      onClick={() => setRating(n)}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <input
                  className="input-field"
                  placeholder="한줄평 (선택)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                {error && <p className="field-error">{error}</p>}
                <div className="dash-card-actions">
                  <button type="button" className="dash-btn-confirm" disabled={submitting} onClick={submitReview}>
                    {submitting ? '등록 중...' : '등록'}
                  </button>
                  <button type="button" className="dash-btn-ghost" onClick={() => setShowReview(false)}>취소</button>
                </div>
              </div>
            )}
          </>
        )}
        {done && <p className="review-done">✓ 리뷰를 남겼어요, 감사합니다</p>}
      </div>
    </div>
  )
}

function FamilyTab({ members, onChange }) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <>
      <div className="section-label">등록된 가족 구성원</div>
      <div className="dash-list" style={{ marginBottom: 14 }}>
        {members.map((m) => (
          <FamilyMemberCard key={m.id} member={m} onChange={onChange} />
        ))}
      </div>

      {!showAdd ? (
        <button type="button" className="member-chip add" onClick={() => setShowAdd(true)} style={{ width: '100%', justifyContent: 'center' }}>
          + 가족 추가
        </button>
      ) : (
        <AddMemberForm onDone={() => { setShowAdd(false); onChange() }} onCancel={() => setShowAdd(false)} />
      )}
    </>
  )
}

function FamilyMemberCard({ member, onChange }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.name)
  const [relationship, setRelationship] = useState(member.relationship)
  const [birthYear, setBirthYear] = useState(member.birth_year || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isSelf = member.relationship === '본인'

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.updateFamilyMember(member.id, { name, relationship, birthYear: birthYear || null })
      setEditing(false)
      onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await api.removeFamilyMember(member.id)
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!editing) {
    return (
      <div className="dash-card">
        <div className="dash-card-main">
          <div className="dash-card-title">{member.name} <span className="dash-badge dash-badge-confirmed">{member.relationship}</span></div>
          <div className="dash-card-sub">{member.birth_year ? `${member.birth_year}년생` : '출생연도 미등록'}</div>
        </div>
        <div className="dash-card-actions">
          <button className="dash-btn-ghost" onClick={() => setEditing(true)}>수정</button>
          {!isSelf && <button className="dash-btn-reject" onClick={handleDelete}>삭제</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="dash-card member-add-form">
      <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
      {!isSelf && (
        <select className="input-field" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      <input className="input-field" type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="출생연도 (선택)" />
      {error && <p className="field-error">{error}</p>}
      <div className="dash-card-actions">
        <button className="dash-btn-confirm" disabled={saving} onClick={handleSave}>{saving ? '저장 중...' : '저장'}</button>
        <button className="dash-btn-ghost" onClick={() => setEditing(false)}>취소</button>
      </div>
    </div>
  )
}

function AddMemberForm({ onDone, onCancel }) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState(RELATIONSHIP_OPTIONS[0])
  const [birthYear, setBirthYear] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.addFamilyMember(name.trim(), relationship, birthYear || null)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="member-add-form" onSubmit={handleSubmit}>
      <input className="input-field" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="input-field" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
        {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input className="input-field" type="number" placeholder="출생연도 (선택)" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
      {error && <p className="field-error">{error}</p>}
      <div className="dash-card-actions">
        <button className="dash-btn-confirm" type="submit" disabled={saving}>{saving ? '추가 중...' : '추가하기'}</button>
        <button className="dash-btn-ghost" type="button" onClick={onCancel}>취소</button>
      </div>
    </form>
  )
}

function AccountTab({ user, onLoggedOut }) {
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await api.deleteAccount(password)
      clearToken()
      onLoggedOut()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="dash-card" style={{ marginBottom: 14 }}>
        <div className="dash-card-title">{user?.name}</div>
        <div className="dash-card-sub">{user?.email || user?.phone || '연락처 정보 없음'}</div>
      </div>

      <PushNotificationToggle />

      <button
        type="button"
        className="dash-btn-ghost"
        style={{ width: '100%', padding: '12px 0', marginBottom: 14 }}
        onClick={onLoggedOut}
      >
        로그아웃
      </button>

      <div className="section-label">계정 삭제</div>
      <p className="drug-disclaimer" style={{ marginBottom: 10 }}>
        회원 탈퇴 시 예약/처방/가족 구성원 정보가 모두 삭제되며 복구할 수 없어요.
      </p>

      {!confirming ? (
        <button type="button" className="dash-btn-reject" style={{ width: '100%', padding: '12px 0' }} onClick={() => setConfirming(true)}>
          회원 탈퇴
        </button>
      ) : (
        <div className="member-add-form">
          <p className="field-error">정말 탈퇴하시겠어요? 이 작업은 되돌릴 수 없어요.</p>
          {user?.email && (
            <input
              className="input-field"
              type="password"
              placeholder="비밀번호 확인"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          {error && <p className="field-error">{error}</p>}
          <div className="dash-card-actions">
            <button className="dash-btn-reject" disabled={deleting} onClick={handleDelete}>
              {deleting ? '처리 중...' : '탈퇴 확정'}
            </button>
            <button className="dash-btn-ghost" onClick={() => setConfirming(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PushNotificationToggle() {
  const [supported, setSupported] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function check() {
      if (!isPushSupported()) {
        setSupported(false)
        setChecking(false)
        return
      }
      const sub = await getExistingSubscription()
      setSubscribed(Boolean(sub))
      setChecking(false)
    }
    check()
  }, [])

  async function handleToggle() {
    setLoading(true)
    setError('')
    try {
      if (subscribed) {
        const sub = await unsubscribeFromPush()
        if (sub?.endpoint) await api.pushUnsubscribe(sub.endpoint)
        setSubscribed(false)
      } else {
        const { publicKey } = await api.pushVapidKey()
        if (!publicKey) {
          setError('알림 기능이 아직 설정되지 않았어요 (관리자에게 문의해주세요)')
          return
        }
        const subscription = await subscribeToPush(publicKey)
        await api.pushSubscribe(subscription)
        setSubscribed(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!supported) return null

  return (
    <div className="dash-card" style={{ marginBottom: 14 }}>
      <div className="dash-card-title">브라우저 알림</div>
      <div className="dash-card-sub" style={{ marginBottom: 10 }}>
        예약 확정/거절, 처방전 수락/거절/완료 시 이 브라우저로 바로 알려드려요
      </div>
      {error && <p className="field-error" style={{ marginBottom: 8 }}>{error}</p>}
      {checking ? (
        <p className="dash-card-sub">확인 중...</p>
      ) : (
        <button
          type="button"
          className={subscribed ? 'dash-btn-ghost' : 'dash-btn-primary'}
          style={{ width: '100%' }}
          onClick={handleToggle}
          disabled={loading}
        >
          {loading ? '처리 중...' : subscribed ? '알림 끄기' : '🔔 알림 켜기'}
        </button>
      )}
    </div>
  )
}
