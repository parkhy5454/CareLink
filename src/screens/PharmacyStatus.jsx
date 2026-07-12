import { useEffect, useState } from 'react'
import { api } from '../api.js'

const POLL_MS = 2500

export default function PharmacyStatus({ onHome }) {
  const [prescription, setPrescription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resending, setResending] = useState(false)
  const [showPharmacySearch, setShowPharmacySearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await api.latestPrescription()
        if (!cancelled) setPrescription(data.prescription)
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  async function handleSearchPharmacy() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const data = await api.searchPharmacies({ q: query.trim(), limit: 8 })
      setResults(data.pharmacies)
    } catch (err) {
      setResendError(err.message)
    } finally {
      setSearching(false)
    }
  }

  async function handleResend(pharmacyCode) {
    setResending(true)
    setResendError('')
    try {
      const data = await api.resendPrescription(prescription.id, pharmacyCode)
      setPrescription(data.prescription)
      setShowPharmacySearch(false)
      setQuery('')
      setResults([])
    } catch (err) {
      setResendError(err.message)
    } finally {
      setResending(false)
    }
  }

  const status = prescription?.status || 'pending'
  const step2Active = status === 'accepted' || status === 'ready'
  const step3Active = status === 'ready'

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
        <div className="status">
          <div className="status-header">
            <button className="back" onClick={onHome}>‹</button>
            <p>조제 현황</p>
          </div>

          {loading ? (
            <div className="status-card">
              <p style={{ margin: 0, fontSize: 13, color: '#6B7078' }}>불러오는 중...</p>
            </div>
          ) : status === 'rejected' ? (
            <>
              <div className="status-done-badge status-done-badge-reject">
                이 약국에서 처방전을 받을 수 없어요
              </div>
              <div className="status-card">
                <div className="status-pharm">{prescription?.pharmacy_name || '약국'}</div>
                <p className="status-big" style={{ color: '#C0392B' }}>거절됨</p>
                <p className="status-sub">사유: {prescription?.reject_reason || '약국 사정으로 접수가 어려워요'}</p>
              </div>

              {!showPharmacySearch ? (
                <button className="btn-restart" style={{ marginBottom: 10 }} onClick={() => setShowPharmacySearch(true)}>
                  다른 약국 찾기
                </button>
              ) : (
                <div className="status-card">
                  <div className="status-pharm">다른 약국으로 다시 보내기</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      className="input-field"
                      style={{ flex: 1 }}
                      placeholder="약국 이름 또는 주소 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPharmacy()}
                    />
                    <button className="dept-chip" onClick={handleSearchPharmacy} disabled={searching}>
                      {searching ? '검색중' : '검색'}
                    </button>
                  </div>
                  {resendError && <p className="field-error" style={{ marginTop: 8 }}>{resendError}</p>}
                  <div style={{ marginTop: 10 }}>
                    {results.map((p) => (
                      <div key={p.code} className="other-card" onClick={() => !resending && handleResend(p.code)}>
                        <div className="other-ico">{p.name.slice(0, 1)}</div>
                        <div className="txt">
                          <p>{p.name}</p>
                          <span>{p.sido} {p.sigungu} {p.phone ? `· ${p.phone}` : ''}</span>
                        </div>
                        <div className="chev">›</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {status === 'ready' && (
                <div className="status-done-badge">✓ 조제가 완료됐어요, 약국에서 바로 수령할 수 있어요</div>
              )}

              <div className="status-card">
                <div className="status-pharm">{prescription?.pharmacy_name || '약국'}</div>
                {status === 'pending' && (
                  <>
                    <p className="status-big">약국에서 <span>확인하고 있어요</span></p>
                    <p className="status-sub">약국이 수락하면 바로 조제가 시작돼요</p>
                  </>
                )}
                {status === 'accepted' && (
                  <>
                    <p className="status-big">조제 <span>진행 중이에요</span></p>
                    <p className="status-sub">약국에서 준비가 끝나면 알려드려요</p>
                  </>
                )}
                {status === 'ready' && (
                  <>
                    <p className="status-big">조제 완료 <span>· 지금 방문 가능</span></p>
                    <p className="status-sub">영수증과 신분증을 보여주시면 바로 수령할 수 있어요</p>
                  </>
                )}

                <div className="progress-track">
                  <div
                    className={`progress-fill ${status === 'accepted' ? 'progress-fill-active' : ''}`}
                    style={{ width: status === 'ready' ? '100%' : status === 'accepted' ? '60%' : '10%' }}
                  ></div>
                </div>

                <div className="steps">
                  <div className="step active">
                    <div className="dot">✓</div>
                    <span>전송 완료</span>
                  </div>
                  <div className={`step ${step2Active ? 'active' : ''}`}>
                    <div className="dot">{step2Active ? '✓' : '2'}</div>
                    <span>조제 중</span>
                  </div>
                  <div className={`step ${step3Active ? 'active' : ''}`}>
                    <div className="dot">{step3Active ? '✓' : '3'}</div>
                    <span>조제 완료</span>
                  </div>
                </div>
              </div>

              <div className="status-note">
                💬 <span><b>알림</b>이 오면 약국에 방문해 결제 후 수령하시면 돼요. 이 화면을 닫아도 상태는 계속 업데이트돼요.</span>
              </div>
            </>
          )}

          <button className="btn-restart" onClick={onHome}>홈으로 돌아가기</button>
        </div>
      </div>
    </>
  )
}
