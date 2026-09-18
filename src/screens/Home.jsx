import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import HospitalMap from '../components/HospitalMap.jsx'

const QUICK_DEPTS = ['내과', '소아청소년과', '피부과', '정형외과', '이비인후과', '치과']
const RELATIONSHIP_OPTIONS = ['자녀', '배우자', '부모님', '형제자매', '기타']

export default function Home({ user, booking, onBookingChange, onGotoOCR, onLogout }) {
  const [loadingBooking, setLoadingBooking] = useState(true)
  const [showReferral, setShowReferral] = useState(false)
  const [toast, setToast] = useState('')

  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  const [viewMode, setViewMode] = useState('list') // list | map
  const [myLocation, setMyLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [cancelConfirming, setCancelConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // 시간 선택 화면 (병원을 고르면 이 병원의 예약 가능 시간표를 보여줌)
  const [picker, setPicker] = useState(null) // { code, name } | null
  const [slotDays, setSlotDays] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [bookingSlot, setBookingSlot] = useState(null)
  const [pickerRating, setPickerRating] = useState(null) // { averageRating, count } | null

  // 예약 대상(가족 구성원) 선택
  const [members, setMembers] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [showAddMember, setShowAddMember] = useState(false)

  useEffect(() => {
    if (booking !== null) {
      setLoadingBooking(false)
      return
    }
    api.latestBooking()
      .then((data) => onBookingChange(data.booking))
      .catch((err) => showToast(err.message))
      .finally(() => setLoadingBooking(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 병원이 아직 확인 중(pending)이면 몇 초마다 상태를 다시 확인해서 확정/거절이 되면 바로 반영
  useEffect(() => {
    if (booking?.status !== 'pending') return
    const interval = setInterval(() => {
      api.latestBooking().then((data) => onBookingChange(data.booking)).catch(() => {})
    }, 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.status])

  useEffect(() => {
    if (query.trim().length < 2 && !dept && !myLocation) {
      setResults([])
      return
    }
    setSearching(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const extra = { ...(dept ? { dept } : {}), ...(myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : {}) }
        const data = await api.searchHospitals(query.trim(), extra)
        setResults(data.hospitals)
      } catch (err) {
        showToast(err.message)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, dept, myLocation])

  async function handleCancelBooking(bookingId) {
    setCancelling(true)
    try {
      await api.cancelBooking(bookingId)
      onBookingChange(null)
      setCancelConfirming(false)
      showToast('예약을 취소했어요')
    } catch (err) {
      showToast(err.message)
    } finally {
      setCancelling(false)
    }
  }

  function handleFindNearMe() {
    if (!navigator.geolocation) {
      showToast('이 브라우저에서는 위치 확인을 지원하지 않아요')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setViewMode('map')
        setLocating(false)
      },
      () => {
        showToast('위치 정보를 가져오지 못했어요. 위치 권한을 확인해주세요')
        setLocating(false)
      },
      { timeout: 8000 }
    )
  }

  function showToast(message) {
    setToast(message)
    setTimeout(() => setToast(''), 2200)
  }

  async function loadMembers(preferId) {
    try {
      const data = await api.familyMembers()
      setMembers(data.members)
      if (preferId && data.members.some((m) => m.id === preferId)) {
        setSelectedMemberId(preferId)
      } else if (!data.members.some((m) => m.id === selectedMemberId)) {
        const self = data.members.find((m) => m.relationship === '본인')
        setSelectedMemberId(self ? self.id : data.members[0]?.id || null)
      }
    } catch (err) {
      showToast(err.message)
    }
  }

  async function openPicker(hospitalCode, hospitalName) {
    setPicker({ code: hospitalCode, name: hospitalName })
    setShowAddMember(false)
    setLoadingSlots(true)
    setPickerRating(null)
    await loadMembers()
    api.hospitalReviews(hospitalCode).then((data) => setPickerRating(data)).catch(() => {})
    try {
      const data = await api.hospitalSlots(hospitalCode)
      setSlotDays(data.days)
    } catch (err) {
      showToast(err.message)
      setSlotDays([])
    } finally {
      setLoadingSlots(false)
    }
  }

  function closePicker() {
    setPicker(null)
    setSlotDays([])
  }

  async function handleAddMember(name, relationship, birthYear) {
    try {
      const data = await api.addFamilyMember(name, relationship, birthYear)
      await loadMembers(data.member.id)
      setShowAddMember(false)
    } catch (err) {
      showToast(err.message)
    }
  }

  async function handlePickSlot(label) {
    if (bookingSlot) return
    if (!selectedMemberId) {
      showToast('예약할 가족 구성원을 먼저 선택해주세요')
      return
    }
    setBookingSlot(label)
    try {
      const data = await api.createBooking(picker.code, label, selectedMemberId)
      onBookingChange(data.booking)
      showToast(`${data.booking.patient_name} · ${label} 예약 완료`)
      closePicker()
    } catch (err) {
      showToast(err.message)
      // 다른 사람이 방금 그 시간을 채갔을 수 있으니 목록을 새로고침
      openPicker(picker.code, picker.name)
    } finally {
      setBookingSlot(null)
    }
  }

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
          {picker ? (
            <SlotPicker
              picker={picker}
              rating={pickerRating}
              slotDays={slotDays}
              loading={loadingSlots}
              bookingSlot={bookingSlot}
              members={members}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              showAddMember={showAddMember}
              onToggleAddMember={() => setShowAddMember((v) => !v)}
              onAddMember={handleAddMember}
              onBack={closePicker}
              onPick={handlePickSlot}
            />
          ) : (
            <>
              <div className="home-header">
                <div className="home-brand"><span className="dot"></span>내건강</div>
                <div className="home-header-right">
                  <button type="button" className="home-referral-btn" onClick={() => setShowReferral((v) => !v)}>
                    🎁 친구 추천
                  </button>
                  <div className="home-user">{user?.name || '회원'} 님</div>
                  <button type="button" className="home-logout" onClick={onLogout}>로그아웃</button>
                </div>
              </div>

              {showReferral && <ReferralCard />}

              <SymptomChecker onPickDepartment={(name) => { setDept(name); setQuery('') }} />

              {loadingBooking ? (
                <div className="hero-card">
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>예약 정보를 불러오는 중...</p>
                </div>
              ) : booking && booking.status === 'confirmed' ? (
                <div className="hero-card done">
                  <div className="hero-eyebrow">✓ 병원이 예약을 확정했어요</div>
                  <div className="hero-title">
                    {booking.hospital_name}
                    {booking.patient_name && <> · <b>{booking.patient_name}</b> 님</>}
                    <br /><b>{booking.appointment_label}</b>, 예약번호 {booking.booking_code}
                  </div>
                  <div className="hero-row">
                    <div className="info">
                      <p>{booking.address || '진료 후 처방전을 받으면'}</p>
                      <span>바로 약국으로 전송할 수 있어요</span>
                    </div>
                  </div>
                  <button className="btn-rebook" onClick={onGotoOCR}>처방전 촬영하러 가기</button>
                  <div style={{ height: 10 }}></div>
                  <button
                    type="button"
                    className="rebook-link"
                    onClick={() => openPicker(booking.hospital_code, booking.hospital_name)}
                    disabled={!booking.hospital_code}
                  >
                    같은 병원으로 다른 시간에 한 번 더 예약하기
                  </button>
                  <div style={{ height: 6 }}></div>
                  {cancelConfirming ? (
                    <div className="cancel-confirm">
                      <span>정말 취소할까요?</span>
                      <button type="button" className="rebook-link" onClick={() => handleCancelBooking(booking.id)} disabled={cancelling}>
                        {cancelling ? '취소 중...' : '네, 취소할게요'}
                      </button>
                      <button type="button" className="rebook-link" onClick={() => setCancelConfirming(false)}>아니요</button>
                    </div>
                  ) : (
                    <button type="button" className="rebook-link" onClick={() => setCancelConfirming(true)}>
                      예약 취소하기
                    </button>
                  )}
                </div>
              ) : booking && booking.status === 'pending' ? (
                <div className="hero-card pending">
                  <div className="hero-eyebrow">⏳ 병원에서 확인하고 있어요</div>
                  <div className="hero-title">
                    {booking.hospital_name}
                    {booking.patient_name && <> · <b>{booking.patient_name}</b> 님</>}
                    <br /><b>{booking.appointment_label}</b> 예약 요청
                  </div>
                  <div className="hero-row">
                    <div className="info">
                      <p>병원이 확정하면 자동으로 알려드려요</p>
                      <span>예약번호 {booking.booking_code}</span>
                    </div>
                  </div>
                  {cancelConfirming ? (
                    <div className="cancel-confirm">
                      <span>정말 취소할까요?</span>
                      <button type="button" className="rebook-link" onClick={() => handleCancelBooking(booking.id)} disabled={cancelling}>
                        {cancelling ? '취소 중...' : '네, 취소할게요'}
                      </button>
                      <button type="button" className="rebook-link" onClick={() => setCancelConfirming(false)}>아니요</button>
                    </div>
                  ) : (
                    <button type="button" className="rebook-link" onClick={() => setCancelConfirming(true)}>
                      예약 취소하기
                    </button>
                  )}
                </div>
              ) : booking && booking.status === 'rejected' ? (
                <div className="hero-card rejected">
                  <div className="hero-eyebrow">병원에서 이 예약을 거절했어요</div>
                  <div className="hero-title">{booking.hospital_name}<br />다른 병원을 찾아볼까요?</div>
                  <div className="hero-row">
                    <div className="info">
                      <p>아래에서 다른 병원을 검색해보세요</p>
                      <span>예약번호 {booking.booking_code}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hero-card">
                  <div className="hero-eyebrow">전국 병원 실데이터로 검색해요</div>
                  <div className="hero-title">아래에서 병원을 검색하고<br /><b>예약</b>을 시작해보세요</div>
                  <div className="hero-row">
                    <div className="info">
                      <p>이름, 주소, 진료과목으로 검색</p>
                      <span>예: "이내과", "강남구 피부과"</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="section-label">병원 검색</div>
              <input
                className="input-field search-field"
                type="text"
                placeholder="병원 이름 또는 주소로 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="dept-chips">
                {QUICK_DEPTS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`dept-chip ${dept === d ? 'active' : ''}`}
                    onClick={() => setDept(dept === d ? '' : d)}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button className="near-me-btn" onClick={handleFindNearMe} disabled={locating}>
                {locating ? '위치 확인 중...' : '📍 내 근처 병원 찾기'}
              </button>

              <div className="view-toggle">
                <button
                  type="button"
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => setViewMode('list')}
                >
                  목록
                </button>
                <button
                  type="button"
                  className={viewMode === 'map' ? 'active' : ''}
                  onClick={() => setViewMode('map')}
                >
                  지도
                </button>
              </div>

              {searching && <p className="search-status">검색 중...</p>}

              {!searching && results.length === 0 && (query.trim().length >= 2 || dept || myLocation) && (
                <p className="search-status">검색 결과가 없어요</p>
              )}

              {!searching && results.length > 0 && viewMode === 'map' && (
                <HospitalMap
                  hospitals={results}
                  myLocation={myLocation}
                  onSelect={(h) => openPicker(h.code, h.name)}
                />
              )}

              {viewMode === 'list' && results.map((h) => (
                <div className="other-card" key={h.code} onClick={() => openPicker(h.code, h.name)}>
                  <div className="other-ico">{h.name.slice(0, 1)}</div>
                  <div className="txt">
                    <p>{h.name}</p>
                    <span>
                      {h.type} · {h.sido} {h.sigungu}
                      {h.distance_km != null ? ` · ${h.distance_km.toFixed(1)}km` : ''}
                      {h.phone ? ` · ${h.phone}` : ''}
                    </span>
                  </div>
                  <div className="chev">›</div>
                </div>
              ))}
            </>
          )}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  )
}

function SlotPicker({
  picker, rating, slotDays, loading, bookingSlot,
  members, selectedMemberId, onSelectMember,
  showAddMember, onToggleAddMember, onAddMember,
  onBack, onPick
}) {
  const [newName, setNewName] = useState('')
  const [newRelationship, setNewRelationship] = useState(RELATIONSHIP_OPTIONS[0])
  const [newBirthYear, setNewBirthYear] = useState('')

  function submitAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    onAddMember(newName.trim(), newRelationship, newBirthYear || null)
    setNewName('')
    setNewBirthYear('')
  }

  return (
    <>
      <div className="picker-header">
        <button type="button" className="picker-back" onClick={onBack}>‹</button>
        <div>
          <p className="picker-title">
            {picker.name}
            {rating?.averageRating && <span className="picker-rating"> ★ {rating.averageRating} ({rating.count})</span>}
          </p>
          <span className="picker-sub">예약 대상과 시간을 선택해주세요</span>
        </div>
      </div>

      <div className="section-label">예약 대상</div>
      <div className="member-chips">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`member-chip ${selectedMemberId === m.id ? 'active' : ''}`}
            onClick={() => onSelectMember(m.id)}
          >
            {m.name} <span>{m.relationship}</span>
          </button>
        ))}
        <button type="button" className="member-chip add" onClick={onToggleAddMember}>
          + 가족 추가
        </button>
      </div>

      {showAddMember && (
        <form className="member-add-form" onSubmit={submitAdd}>
          <input
            className="input-field"
            placeholder="이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            className="input-field"
            value={newRelationship}
            onChange={(e) => setNewRelationship(e.target.value)}
          >
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            className="input-field"
            type="number"
            placeholder="출생연도 (선택)"
            value={newBirthYear}
            onChange={(e) => setNewBirthYear(e.target.value)}
          />
          <button className="btn-oauth btn-primary" type="submit">추가하기</button>
        </form>
      )}

      <div className="section-label" style={{ marginTop: 16 }}>예약 가능 시간</div>
      {loading ? (
        <p className="search-status">시간을 불러오는 중...</p>
      ) : slotDays.length === 0 ? (
        <p className="search-status">예약 가능한 시간이 없어요</p>
      ) : (
        slotDays.map((d) => (
          <div className="slot-day" key={d.day}>
            <div className="slot-day-label">{d.day}</div>
            <div className="slot-grid">
              {d.times.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className={`slot-btn ${t.taken ? 'taken' : ''}`}
                  disabled={t.taken || bookingSlot === t.label}
                  onClick={() => onPick(t.label)}
                >
                  {bookingSlot === t.label ? '예약 중...' : t.taken ? `${t.time} · 마감` : t.time}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}

function SymptomChecker({ onPickDepartment }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notConfigured, setNotConfigured] = useState(false)

  async function handleCheck(e) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setNotConfigured(false)
    try {
      const data = await api.checkSymptoms(text.trim())
      setResult(data)
    } catch (err) {
      if (err.message?.includes('설정되지 않았')) setNotConfigured(true)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="symptom-box">
      <div className="section-label">어디가 어떻게 아프세요?</div>
      <form onSubmit={handleCheck} className="symptom-form">
        <textarea
          className="input-field symptom-textarea"
          placeholder="예: 3일 전부터 허리가 뻐근하고 아침에 일어날 때 특히 아파요"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
        />
        <button className="btn-oauth btn-primary" type="submit" disabled={loading || !text.trim()}>
          {loading ? '확인하고 있어요...' : '진료과 확인하기'}
        </button>
      </form>

      {error && (
        <div className="capture-error" style={{ marginTop: 10, maxWidth: 'none' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="symptom-result">
          {result.urgent && (
            <div className="symptom-urgent">🚨 {result.urgentMessage || '응급 증상일 수 있어요. 119에 연락하거나 응급실을 방문하세요.'}</div>
          )}
          {result.departments.map((d) => (
            <div className="symptom-dept-card" key={d.name}>
              <div className="symptom-dept-top">
                <span className="symptom-dept-name">{d.name}</span>
                <button type="button" className="dept-chip active" onClick={() => onPickDepartment(d.name)}>
                  이 진료과로 찾기
                </button>
              </div>
              <p className="symptom-dept-reason">{d.reason}</p>
            </div>
          ))}
          <p className="drug-disclaimer">
            * Google AI가 증상 설명을 바탕으로 추천한 참고용 정보예요. 정확한 진단은 의료진과 상담해주세요.
          </p>
        </div>
      )}
    </div>
  )
}

function ReferralCard() {
  const [code, setCode] = useState('')
  const [referredCount, setReferredCount] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.me()
      .then((data) => {
        setCode(data.user.referralCode || '')
        setReferredCount(data.user.referredCount ?? 0)
      })
      .catch((err) => setError(err.message))
  }, [])

  const shareText = code
    ? `내건강 앱에서 병원 예약하고 처방전까지 한 번에! 제 추천 코드 "${code}"를 입력하고 가입해보세요.`
    : ''

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: '내건강 추천', text: shareText })
      } catch {
        // 사용자가 공유를 취소한 경우 등 - 조용히 무시
      }
    } else {
      handleCopy()
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('복사에 실패했어요, 코드를 직접 선택해서 복사해주세요')
    }
  }

  function handleSms() {
    // iOS/안드로이드 둘 다 대체로 인식하는 형태예요. 눌러보고 문자 앱이 안 열리면 "공유하기"를 써주세요
    window.location.href = `sms:?&body=${encodeURIComponent(shareText)}`
  }

  if (error) return null
  if (!code) return null

  return (
    <div className="dash-card referral-card" style={{ marginBottom: 14 }}>
      <div className="dash-card-title">🎁 친구 추천하기</div>
      <p className="dash-card-sub" style={{ marginBottom: 10 }}>
        내 추천 코드로 친구가 가입하면 서로에게 좋은 일이 생겨요 (혜택은 곧 추가될 예정이에요)
      </p>
      <div className="referral-code-box">{code}</div>
      {referredCount !== null && (
        <p className="referral-count">지금까지 {referredCount}명이 이 코드로 가입했어요</p>
      )}
      <div className="dash-card-actions referral-actions">
        <button type="button" className="dash-btn-confirm" onClick={handleShare}>💬 카카오톡/공유</button>
        <button type="button" className="dash-btn-confirm referral-sms" onClick={handleSms}>📱 문자로 보내기</button>
      </div>
      <button type="button" className="dash-btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={handleCopy}>
        {copied ? '복사됐어요!' : '코드만 복사하기'}
      </button>
    </div>
  )
}
