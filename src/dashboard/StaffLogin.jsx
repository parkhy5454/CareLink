import { useState } from 'react'
import { staffApi, setStaffToken } from '../staffApi.js'

export default function StaffLogin({ roleLabel, onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await staffApi.login(username, password)
      setStaffToken(data.token)
      onLoggedIn(data.staff)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dash-login-wrap">
      <form className="dash-login-card" onSubmit={handleSubmit}>
        <div className="dash-login-logo">건</div>
        <h1>내건강 {roleLabel} 대시보드</h1>
        <p className="dash-login-sub">담당자 계정으로 로그인해주세요</p>
        <input
          className="dash-input"
          type="text"
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="dash-input"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="dash-error">{error}</p>}
        <button className="dash-btn-primary" type="submit" disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
        <p className="dash-login-note">
          {roleLabel === '관리자'
            ? '계정이 없으신가요? 관리자에게 발급을 요청해주세요.'
            : <>아직 계정이 없으신가요? <a href="/apply">입점 신청하기</a></>}
        </p>
      </form>
    </div>
  )
}
