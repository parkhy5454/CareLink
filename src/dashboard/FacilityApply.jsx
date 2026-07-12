import { useState } from 'react'
import { api } from '../api.js'

export default function FacilityApply() {
  const [role, setRole] = useState('hospital')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [note, setNote] = useState('')
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const path = role === 'hospital'
        ? `/hospitals/search?q=${encodeURIComponent(query)}&limit=8`
        : `/pharmacies/search?q=${encodeURIComponent(query)}&limit=8`
      const res = await fetch(`/api${path}`)
      const data = await res.json()
      setResults(role === 'hospital' ? data.hospitals : data.pharmacies)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!selected) {
      setError('먼저 검색해서 우리 병원/약국을 선택해주세요')
      return
    }
    if (!contactName.trim() || !contactPhone.trim()) {
      setError('담당자 이름과 연락처를 입력해주세요')
      return
    }
    setSubmitting(true)
    try {
      await api.submitFacilityApplication({
        role,
        facilityCode: selected.code,
        contactName,
        contactPhone,
        contactEmail,
        note
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="dash-login-wrap">
        <div className="dash-login-card">
          <div className="dash-login-logo">✓</div>
          <h1>신청이 접수됐어요</h1>
          <p className="dash-login-sub">관리자 검토 후 계정 정보를 연락처로 안내드릴게요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dash-page" style={{ maxWidth: 480 }}>
      <header className="dash-header">
        <div>
          <h1>병원/약국 입점 신청</h1>
          <p className="dash-header-sub">승인되면 담당자 계정을 발급해드려요</p>
        </div>
      </header>

      <form className="dash-card" onSubmit={handleSubmit}>
        <div className="member-chips" style={{ marginBottom: 10 }}>
          {['hospital', 'pharmacy'].map((r) => (
            <button
              type="button"
              key={r}
              className={`member-chip ${role === r ? 'active' : ''}`}
              onClick={() => { setRole(r); setSelected(null); setResults([]) }}
            >
              {r === 'hospital' ? '병원' : '약국'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="dash-input"
            style={{ flex: 1 }}
            placeholder={role === 'hospital' ? '우리 병원 이름 검색' : '우리 약국 이름 검색'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="dash-btn-ghost" onClick={handleSearch} disabled={searching}>
            {searching ? '검색 중' : '검색'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="dash-list" style={{ marginBottom: 10 }}>
            {results.map((f) => (
              <button
                type="button"
                key={f.code}
                className={`dash-chip ${selected?.code === f.code ? 'active' : ''}`}
                style={{ textAlign: 'left', marginBottom: 6, width: '100%' }}
                onClick={() => setSelected(f)}
              >
                {f.name} ({f.sido} {f.sigungu})
              </button>
            ))}
          </div>
        )}
        {selected && <p className="dash-card-sub" style={{ marginBottom: 10 }}>선택됨: {selected.name}</p>}

        <input className="dash-input" style={{ marginBottom: 8 }} placeholder="담당자 이름" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <input className="dash-input" style={{ marginBottom: 8 }} placeholder="연락처 (휴대폰 번호)" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        <input className="dash-input" style={{ marginBottom: 8 }} placeholder="이메일 (선택)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        <input className="dash-input" style={{ marginBottom: 8 }} placeholder="전달하고 싶은 말 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />

        {error && <p className="dash-error">{error}</p>}
        <button className="dash-btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 8 }}>
          {submitting ? '접수 중...' : '입점 신청하기'}
        </button>
      </form>
    </div>
  )
}
