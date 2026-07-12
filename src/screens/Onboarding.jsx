import { useState } from 'react'
import { api, setToken, oauthUrls } from '../api.js'

const TERMS_TEXT = `제1조 (목적)
이 약관은 "내건강"(이하 "회사")이 제공하는 병원 예약·처방전 전송·약국 조제 중개 서비스(이하 "서비스")의 이용과 관련하여 회사와 회원 간의 권리·의무 및 책임사항을 정함을 목적으로 합니다.

제2조 (서비스의 제공)
회사는 병원 예약 중개, 처방전 전송 중개, 약국 조제 현황 안내 등의 서비스를 제공하며, 실제 진료·조제 행위의 주체는 각 병원·약국입니다.

제3조 (회원의 의무)
회원은 예약 시 실제 진료를 받을 본인 또는 가족의 정보를 정확히 입력해야 하며, 허위 정보로 인한 불이익은 회원 본인이 부담합니다.

(본 약관은 데모용 예시이며, 실제 서비스 출시 전 반드시 법률 검토를 받아야 합니다.)`

const PRIVACY_TEXT = `1. 수집하는 개인정보 항목
이름, 전화번호 또는 이메일, 가족 구성원 정보(이름, 관계, 출생연도), 예약 및 처방 내역 등 건강 관련 민감정보를 수집합니다.

2. 수집 목적
병원 예약 중개, 처방전 전송 중개, 본인 확인, 서비스 이용 기록 관리를 위해 수집합니다.

3. 보유 기간
회원 탈퇴 시까지 보유하며, 관계 법령에 따라 일정 기간 별도 보관될 수 있습니다.

4. 민감정보 처리 동의
회사는 예약·처방 내역 등 건강에 관한 정보를 개인정보보호법상 민감정보로 처리하며, 이 동의는 서비스 이용을 위해 필수입니다.

(본 방침은 데모용 예시이며, 실제 서비스 출시 전 반드시 법률 검토를 받아야 합니다.)`

export default function Onboarding({ onLoggedIn, notice, onDismissNotice }) {
  const [method, setMethod] = useState('phone') // phone | email
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)
  const [expanded, setExpanded] = useState(null) // 'terms' | 'privacy' | null
  const [blockedMsg, setBlockedMsg] = useState('')

  const canProceed = agreeTerms && agreePrivacy
  const consent = { agreeTerms, agreePrivacy, agreeMarketing }

  function handleAgreeAll(checked) {
    setAgreeTerms(checked)
    setAgreePrivacy(checked)
    setAgreeMarketing(checked)
  }

  function handleSocialClick(url) {
    if (!canProceed) {
      setBlockedMsg('이용약관과 개인정보 처리방침에 동의해주세요')
      setTimeout(() => setBlockedMsg(''), 2200)
      return
    }
    window.location.href = url
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
        <div className="onboard onboard-scroll">
          <div className="onboard-top onboard-top-compact">
            <div className="logo-mark">건</div>
            <div className="brand-name">내건강</div>
            <div className="onboard-copy">
              <h1>병원 예약부터 약 수령까지<br /><strong>한 곳에서</strong> 빠르게</h1>
            </div>
          </div>

          {notice && (
            <div className="auth-notice">
              {notice}
              <button type="button" className="auth-notice-close" onClick={onDismissNotice}>✕</button>
            </div>
          )}

          <div className="consent-box">
            <label className="consent-row consent-row-all">
              <input
                type="checkbox"
                checked={agreeTerms && agreePrivacy && agreeMarketing}
                onChange={(e) => handleAgreeAll(e.target.checked)}
              />
              전체 동의
            </label>
            <div className="consent-divider"></div>
            <label className="consent-row">
              <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
              <span>[필수] 이용약관 동의</span>
              <button type="button" className="consent-view" onClick={() => setExpanded(expanded === 'terms' ? null : 'terms')}>
                보기
              </button>
            </label>
            {expanded === 'terms' && <pre className="consent-detail">{TERMS_TEXT}</pre>}

            <label className="consent-row">
              <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
              <span>[필수] 개인정보(민감정보 포함) 처리방침 동의</span>
              <button type="button" className="consent-view" onClick={() => setExpanded(expanded === 'privacy' ? null : 'privacy')}>
                보기
              </button>
            </label>
            {expanded === 'privacy' && <pre className="consent-detail">{PRIVACY_TEXT}</pre>}

            <label className="consent-row">
              <input type="checkbox" checked={agreeMarketing} onChange={(e) => setAgreeMarketing(e.target.checked)} />
              <span>[선택] 마케팅 정보 수신 동의</span>
            </label>
          </div>

          {blockedMsg && <p className="field-error" style={{ textAlign: 'center' }}>{blockedMsg}</p>}

          <div className="social-buttons">
            <button type="button" className="btn-oauth btn-google" onClick={() => handleSocialClick(oauthUrls.google)}>
              <span className="oauth-ico" style={{ background: '#fff', border: '1px solid #E9EBEF' }}></span>
              Google로 계속하기
            </button>
            <button type="button" className="btn-oauth btn-kakao" onClick={() => handleSocialClick(oauthUrls.kakao)}>
              <span className="oauth-ico"></span>카카오로 계속하기
            </button>
            <button type="button" className="btn-oauth btn-naver" onClick={() => handleSocialClick(oauthUrls.naver)}>
              <span className="oauth-ico" style={{ background: 'rgba(255,255,255,0.3)' }}></span>네이버로 계속하기
            </button>
          </div>

          <div className="divider"><span>또는</span></div>

          <div className="method-tabs">
            <button
              type="button"
              className={`method-tab ${method === 'phone' ? 'active' : ''}`}
              onClick={() => setMethod('phone')}
            >
              전화번호
            </button>
            <button
              type="button"
              className={`method-tab ${method === 'email' ? 'active' : ''}`}
              onClick={() => setMethod('email')}
            >
              이메일
            </button>
          </div>

          {method === 'phone' ? (
            <PhoneLogin onLoggedIn={onLoggedIn} canProceed={canProceed} consent={consent} />
          ) : (
            <EmailLogin onLoggedIn={onLoggedIn} canProceed={canProceed} consent={consent} />
          )}
        </div>
      </div>
    </>
  )
}

function PhoneLogin({ onLoggedIn, canProceed, consent }) {
  const [step, setStep] = useState('phone') // phone | code
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRequestCode(e) {
    e.preventDefault()
    setError('')
    if (!canProceed) {
      setError('이용약관과 개인정보 처리방침에 동의해주세요')
      return
    }
    if (phone.replace(/[^0-9]/g, '').length < 9) {
      setError('휴대폰 번호를 정확히 입력해주세요')
      return
    }
    setLoading(true)
    try {
      const data = await api.requestCode(phone)
      setDemoCode(data.code)
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    if (code.trim().length < 6) {
      setError('인증번호 6자리를 입력해주세요')
      return
    }
    setLoading(true)
    try {
      const data = await api.verifyCode(phone, code, consent)
      setToken(data.token)
      onLoggedIn(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return step === 'phone' ? (
    <form className="onboard-actions" onSubmit={handleRequestCode}>
      <input
        className="input-field"
        type="tel"
        inputMode="numeric"
        placeholder="휴대폰 번호 (예: 01012345678)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error && <p className="field-error">{error}</p>}
      <button className="btn-oauth btn-primary" type="submit" disabled={loading}>
        {loading ? '전송 중...' : '인증번호 받기'}
      </button>
    </form>
  ) : (
    <form className="onboard-actions" onSubmit={handleVerify}>
      <div className="demo-code-hint">
        데모용 인증번호는 <b>{demoCode}</b> 예요<br />(실제 서비스에서는 문자로 발송돼요)
      </div>
      <input
        className="input-field"
        type="text"
        inputMode="numeric"
        placeholder="인증번호 6자리"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
      />
      {error && <p className="field-error">{error}</p>}
      <button className="btn-oauth btn-primary" type="submit" disabled={loading}>
        {loading ? '확인 중...' : '인증하고 시작하기'}
      </button>
      <button type="button" className="btn-more" onClick={() => { setStep('phone'); setCode(''); setError('') }}>
        전화번호 다시 입력하기
      </button>
    </form>
  )
}

function EmailLogin({ onLoggedIn, canProceed, consent }) {
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && !canProceed) {
      setError('이용약관과 개인정보 처리방침에 동의해주세요')
      return
    }
    setLoading(true)
    try {
      const data = mode === 'login'
        ? await api.emailLogin(email, password)
        : await api.emailSignup(name, email, password, consent)
      setToken(data.token)
      onLoggedIn(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'forgot') {
    return <ForgotPassword onBack={() => setMode('login')} />
  }

  return (
    <form className="onboard-actions" onSubmit={handleSubmit}>
      {mode === 'signup' && (
        <input
          className="input-field"
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        className="input-field"
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoCapitalize="none"
      />
      <input
        className="input-field"
        type="password"
        placeholder="비밀번호 (6자 이상)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="field-error">{error}</p>}
      <button className="btn-oauth btn-primary" type="submit" disabled={loading}>
        {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
      </button>
      <button
        type="button"
        className="btn-more"
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
      >
        {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
      </button>
      {mode === 'login' && (
        <button type="button" className="btn-more" onClick={() => setMode('forgot')}>
          비밀번호를 잊으셨나요?
        </button>
      )}
    </form>
  )
}

function ForgotPassword({ onBack }) {
  const [step, setStep] = useState('email') // email | reset
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleRequestReset(e) {
    e.preventDefault()
    setError('')
    if (!email.includes('@')) {
      setError('올바른 이메일을 입력해주세요')
      return
    }
    setLoading(true)
    try {
      const data = await api.forgotPassword(email)
      if (data.demoCode) setDemoCode(data.demoCode)
      setStep('reset')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError('새 비밀번호는 6자 이상이어야 해요')
      return
    }
    setLoading(true)
    try {
      await api.resetPassword(email, code, newPassword)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="onboard-actions">
        <div className="demo-code-hint">비밀번호가 변경됐어요. 다시 로그인해주세요</div>
        <button className="btn-oauth btn-primary" type="button" onClick={onBack}>로그인하러 가기</button>
      </div>
    )
  }

  return step === 'email' ? (
    <form className="onboard-actions" onSubmit={handleRequestReset}>
      <input
        className="input-field"
        type="email"
        placeholder="가입한 이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoCapitalize="none"
      />
      {error && <p className="field-error">{error}</p>}
      <button className="btn-oauth btn-primary" type="submit" disabled={loading}>
        {loading ? '전송 중...' : '재설정 코드 받기'}
      </button>
      <button type="button" className="btn-more" onClick={onBack}>로그인으로 돌아가기</button>
    </form>
  ) : (
    <form className="onboard-actions" onSubmit={handleReset}>
      <div className="demo-code-hint">
        {demoCode ? <>데모용 재설정 코드는 <b>{demoCode}</b> 예요<br />(실제 서비스에서는 이메일로 발송돼요)</> : '이메일로 받은 코드를 입력해주세요'}
      </div>
      <input
        className="input-field"
        type="text"
        placeholder="재설정 코드 6자리"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <input
        className="input-field"
        type="password"
        placeholder="새 비밀번호 (6자 이상)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      {error && <p className="field-error">{error}</p>}
      <button className="btn-oauth btn-primary" type="submit" disabled={loading}>
        {loading ? '변경 중...' : '비밀번호 변경하기'}
      </button>
      <button type="button" className="btn-more" onClick={onBack}>로그인으로 돌아가기</button>
    </form>
  )
}
