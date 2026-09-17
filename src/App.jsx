import { useEffect, useState } from 'react'
import Onboarding from './screens/Onboarding.jsx'
import Home from './screens/Home.jsx'
import MyInfo from './screens/MyInfo.jsx'
import PrescriptionOCR from './screens/PrescriptionOCR.jsx'
import PharmacyStatus from './screens/PharmacyStatus.jsx'
import TabBar from './components/TabBar.jsx'
import { api, getToken, setToken, clearToken } from './api.js'

const OAUTH_ERROR_MESSAGES = {
  google_not_configured: '구글 로그인은 아직 설정되지 않았어요 (관리자에게 문의해주세요)',
  kakao_not_configured: '카카오 로그인은 아직 설정되지 않았어요 (관리자에게 문의해주세요)',
  naver_not_configured: '네이버 로그인은 아직 설정되지 않았어요 (관리자에게 문의해주세요)',
  google_login_failed: '구글 로그인에 실패했어요, 다시 시도해주세요',
  kakao_login_failed: '카카오 로그인에 실패했어요, 다시 시도해주세요',
  naver_login_failed: '네이버 로그인에 실패했어요, 다시 시도해주세요'
}

// 3단계: 전화번호/이메일/구글/카카오/네이버 로그인 + 실제 병원·약국 데이터 연동
export default function App() {
  const [screen, setScreen] = useState('loading') // loading | onboarding | home | myinfo | ocr | status
  const [user, setUser] = useState(null)
  const [booking, setBooking] = useState(null)
  const [authNotice, setAuthNotice] = useState('')

  // 새로고침 시 저장된 토큰으로 로그인 상태를 복원 + 소셜 로그인 리다이렉트로 돌아온 토큰 처리
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#token=')) {
      setToken(hash.replace('#token=', ''))
      window.history.replaceState(null, '', window.location.pathname)
    } else if (hash.startsWith('#error=')) {
      const code = hash.replace('#error=', '')
      setAuthNotice(OAUTH_ERROR_MESSAGES[code] || '로그인 중 문제가 발생했어요')
      window.history.replaceState(null, '', window.location.pathname)
    }

    const token = getToken()
    if (!token) {
      setScreen('onboarding')
      return
    }
    api.me()
      .then((data) => {
        setUser(data.user)
        setScreen('home')
      })
      .catch(() => {
        clearToken()
        setScreen('onboarding')
      })
  }, [])

  function handleLoggedIn(loggedInUser) {
    setUser(loggedInUser)
    setScreen('home')
  }

  function handleLogout() {
    clearToken()
    setUser(null)
    setBooking(null)
    setScreen('onboarding')
  }

  const isLoggedIn = screen !== 'loading' && screen !== 'onboarding'

  return (
    <div className="demo-page">
      <div className="phone">
        {isLoggedIn && (
          <button className="app-logout" onClick={handleLogout} aria-label="로그아웃">⎋</button>
        )}
        {screen === 'loading' && <LoadingScreen />}
        {screen === 'onboarding' && (
          <Onboarding onLoggedIn={handleLoggedIn} notice={authNotice} onDismissNotice={() => setAuthNotice('')} />
        )}
        {screen === 'home' && (
          <Home
            user={user}
            booking={booking}
            onBookingChange={setBooking}
            onGotoOCR={() => setScreen('ocr')}
          />
        )}
        {screen === 'myinfo' && <MyInfo user={user} onLoggedOut={handleLogout} />}
        {(screen === 'home' || screen === 'myinfo') && (
          <TabBar active={screen} onChange={setScreen} />
        )}
        {screen === 'ocr' && (
          <PrescriptionOCR
            booking={booking}
            onBack={() => setScreen('home')}
            onSent={() => setScreen('status')}
          />
        )}
        {screen === 'status' && <PharmacyStatus onHome={() => setScreen('home')} />}
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
      <p style={{ color: '#6B7078', fontSize: 13 }}>불러오는 중...</p>
    </div>
  )
}
