import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { resizeImageToBase64 } from '../utils/image.js'

export default function PrescriptionOCR({ booking, onBack, onSent }) {
  const [step, setStep] = useState('capture') // capture | analyzing | result
  const [imagePreview, setImagePreview] = useState(null)
  const [imageData, setImageData] = useState(null) // { base64, mimeType }
  const [analysis, setAnalysis] = useState(null) // { readable, medications, patientName, hospitalName }
  const [analyzeError, setAnalyzeError] = useState('')
  const [aiNotConfigured, setAiNotConfigured] = useState(false)

  const [pharmacy, setPharmacy] = useState(null)
  const [pharmacyOptions, setPharmacyOptions] = useState([])
  const [pharmacyQuery, setPharmacyQuery] = useState('')
  const [pharmacySearching, setPharmacySearching] = useState(false)
  const [pharmacyError, setPharmacyError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const fileInputRef = useRef(null)

  // 병원 위치 기준으로 가까운 약국부터 보여줘요 (사용자가 직접 골라서 보낼 수 있게)
  useEffect(() => {
    async function loadNearbyPharmacies() {
      setPharmacySearching(true)
      setPharmacyError('')
      try {
        const params = booking?.lat && booking?.lng
          ? { lat: booking.lat, lng: booking.lng, limit: 10 }
          : booking?.sigungu
            ? { sigungu: booking.sigungu, limit: 10 }
            : { limit: 10 }
        const data = await api.searchPharmacies(params)
        setPharmacyOptions(data.pharmacies)
      } catch (err) {
        setPharmacyError(err.message)
      } finally {
        setPharmacySearching(false)
      }
    }
    loadNearbyPharmacies()
  }, [booking])

  async function handlePharmacySearch() {
    setPharmacySearching(true)
    setPharmacyError('')
    try {
      const params = pharmacyQuery.trim()
        ? { q: pharmacyQuery.trim(), limit: 10 }
        : booking?.lat && booking?.lng
          ? { lat: booking.lat, lng: booking.lng, limit: 10 }
          : { limit: 10 }
      const data = await api.searchPharmacies(params)
      setPharmacyOptions(data.pharmacies)
    } catch (err) {
      setPharmacyError(err.message)
    } finally {
      setPharmacySearching(false)
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzeError('')
    setAiNotConfigured(false)
    try {
      const { base64, mimeType, previewUrl } = await resizeImageToBase64(file)
      setImageData({ base64, mimeType })
      setImagePreview(previewUrl)
    } catch {
      setAnalyzeError('이미지를 불러오지 못했어요. 다시 시도해주세요')
    }
  }

  function handleRetake() {
    setImagePreview(null)
    setImageData(null)
    setAnalyzeError('')
    setAiNotConfigured(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAnalyze() {
    if (!imageData) return
    setStep('analyzing')
    setAnalyzeError('')
    try {
      const data = await api.analyzePrescription(imageData.base64, imageData.mimeType)
      setAnalysis(data)
      setStep('result')
    } catch (err) {
      if (err.message?.includes('설정되지 않았')) {
        setAiNotConfigured(true)
      }
      setAnalyzeError(err.message || '분석 중 문제가 발생했어요')
      setStep('capture')
    }
  }

  function handleSkipAnalysis() {
    setAnalysis({ readable: false, medications: [], patientName: null, hospitalName: null })
    setStep('result')
  }

  async function handleSend() {
    if (sending) return
    if (!pharmacy) {
      setSendError('전송할 약국을 먼저 선택해주세요')
      return
    }
    setSending(true)
    setSendError('')
    try {
      await api.sendPrescription(booking?.id, pharmacy.code, imageData?.base64, imageData?.mimeType, {
        dosageTotalDays: analysis?.dosageTotalDays ?? undefined,
        dosageTimesPerDay: analysis?.dosageTimesPerDay ?? undefined
      })
      onSent()
    } catch (err) {
      setSendError(err.message)
      setSending(false)
    }
  }

  const patientName = analysis?.patientName || booking?.patient_name || '환자'
  const hospitalName = analysis?.hospitalName || booking?.hospital_name || '병원'

  return (
    <>
      <div className="statusbar dark">
        <span>9:41</span>
        <div className="icons">
          <div className="bars"><i></i><i></i><i></i><i></i></div>
          <div className="batt"><div className="batt-fill"></div></div>
        </div>
      </div>
      <div className="screen">
        <div className="ocr">
          {step === 'capture' && (
            <div className="capture-area">
              <div className="cam-topbar">
                <button className="close" onClick={onBack}>✕</button>
                <span className="tag">처방전 촬영</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
              />

              {!imagePreview ? (
                <button className="capture-trigger" onClick={() => fileInputRef.current?.click()}>
                  <span className="capture-trigger-icon">📷</span>
                  처방전 사진 촬영하기
                  <span className="capture-trigger-sub">또는 갤러리에서 선택</span>
                </button>
              ) : (
                <div className="capture-preview">
                  <img src={imagePreview} alt="촬영한 처방전" />
                </div>
              )}

              {analyzeError && (
                <div className="capture-error">
                  {analyzeError}
                  {aiNotConfigured && (
                    <button type="button" className="capture-skip" onClick={handleSkipAnalysis}>
                      AI 분석 없이 계속하기
                    </button>
                  )}
                </div>
              )}

              {imagePreview && (
                <div className="capture-actions">
                  <button className="btn-oauth" style={{ background: '#fff', color: '#16181D' }} onClick={handleRetake}>
                    다시 촬영
                  </button>
                  <button className="btn-oauth btn-primary" onClick={handleAnalyze}>
                    이 사진으로 분석하기
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'analyzing' && (
            <div className="capture-area">
              <div className="capture-preview">
                {imagePreview && <img src={imagePreview} alt="촬영한 처방전" />}
              </div>
              <div className="scan-status" style={{ position: 'relative', marginTop: 20 }}>
                <span className="pulse"></span>Google AI가 처방전을 분석하고 있어요
              </div>
            </div>
          )}

          {step === 'result' && (
            <div className="sheet sheet-full">
              <div className="sheet-topbar">
                <button className="sheet-back" onClick={onBack}>‹</button>
                <p>인식 결과</p>
              </div>

              {analysis?.readable === false && (
                <div className="auth-notice" style={{ marginBottom: 14 }}>
                  이미지에서 약 정보를 정확히 읽지 못했어요. 아래 정보로 전송은 계속할 수 있어요.
                </div>
              )}

              <div className="sheet-title">
                <span className="ok">✓</span>
                <p>확인 후 전송해주세요</p>
              </div>
              <div className="field-row"><span>환자명</span><span>{patientName}</span></div>
              <div className="field-row"><span>병원</span><span>{hospitalName}</span></div>

              <div className="section-label" style={{ marginTop: 14 }}>전송할 약국을 선택해주세요</div>
              {pharmacy && (
                <div className="pharmacy-selected">
                  <div className="txt">
                    <p>{pharmacy.name}</p>
                    <span>
                      {pharmacy.sido} {pharmacy.sigungu}
                      {pharmacy.distance_km != null ? ` · ${pharmacy.distance_km.toFixed(1)}km` : ''}
                    </span>
                  </div>
                  <span className="pharmacy-selected-badge">선택됨</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                <input
                  className="input-field"
                  style={{ flex: 1 }}
                  placeholder="약국 이름 또는 주소로 검색"
                  value={pharmacyQuery}
                  onChange={(e) => setPharmacyQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePharmacySearch()}
                />
                <button type="button" className="dept-chip" onClick={handlePharmacySearch} disabled={pharmacySearching}>
                  {pharmacySearching ? '검색중' : '검색'}
                </button>
              </div>

              {pharmacyError && <p className="field-error">{pharmacyError}</p>}
              {!pharmacySearching && pharmacyOptions.length === 0 && !pharmacyError && (
                <p className="search-status">주변 약국을 찾지 못했어요. 이름으로 검색해보세요</p>
              )}

              <div className="pharmacy-option-list">
                {pharmacyOptions.map((p) => (
                  <div
                    key={p.code}
                    className={`other-card ${pharmacy?.code === p.code ? 'active' : ''}`}
                    onClick={() => setPharmacy(p)}
                  >
                    <div className="other-ico">{p.name.slice(0, 1)}</div>
                    <div className="txt">
                      <p>{p.name}</p>
                      <span>
                        {p.sido} {p.sigungu}
                        {p.distance_km != null ? ` · ${p.distance_km.toFixed(1)}km` : ''}
                        {p.phone ? ` · ${p.phone}` : ''}
                      </span>
                    </div>
                    <div className="chev">{pharmacy?.code === p.code ? '✓' : '›'}</div>
                  </div>
                ))}
              </div>

              <div className="eta-strip" style={{ marginTop: 14 }}>
                <span className="l">진료 종료 예상 시간과 비교</span>
                <span className="r">10분 후 조제 완료</span>
              </div>

              {analysis?.medications?.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 16 }}>처방된 약 안내 (Google AI 분석)</div>
                  <div className="drug-list">
                    {analysis.medications.map((d, i) => (
                      <div className="drug-card" key={`${d.name}-${i}`}>
                        <div className="drug-card-top">
                          <p className="drug-name">{d.name}</p>
                        </div>
                        {d.ingredient && <p className="drug-ingredient">성분: {d.ingredient}</p>}
                        <p className="drug-line"><b>효능·효과</b> {d.effect}</p>
                        <p className="drug-line"><b>복용 시 주의사항</b> {d.precautions}</p>
                      </div>
                    ))}
                  </div>
                  <p className="drug-disclaimer">
                    * Google AI가 사진을 분석한 참고용 정보예요. 정확한 복용법과 주의사항은 처방한 의사·약사와 상담해주세요.
                  </p>
                </>
              )}

              {analysis?.dosageTotalDays > 0 && (
                <div className="demo-code-hint" style={{ marginBottom: 14 }}>
                  💊 {analysis.dosageTotalDays}일치 처방으로 보여요. 조제가 완료되면 아침·점심·저녁 식사 후 복약 알림을 보내드릴게요 (브라우저 알림을 켜두셔야 받을 수 있어요)
                </div>
              )}

              <button className="btn-send" onClick={handleSend} disabled={sending || !pharmacy}>
                {sending ? '전송 중...' : '이 정보 맞아요, 전송하기'}
              </button>
              {sendError && <p className="field-error" style={{ marginTop: 8 }}>{sendError}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
