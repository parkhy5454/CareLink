import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import authRouter from './auth.js'
import oauthRouter from './oauth.js'
import staffAuthRouter from './staffAuth.js'
import bookingsRouter from './bookings.js'
import hospitalsRouter from './hospitals.js'
import prescriptionsRouter from './prescriptions.js'
import familyMembersRouter from './familyMembers.js'
import historyRouter from './history.js'
import prescriptionAnalysisRouter from './prescriptionAnalysis.js'
import symptomCheckRouter from './symptomCheck.js'
import hospitalDashboardRouter from './hospitalDashboard.js'
import pharmacyDashboardRouter from './pharmacyDashboard.js'
import adminDashboardRouter from './adminDashboard.js'
import reviewsRouter from './reviews.js'
import facilityApplicationsRouter from './facilityApplications.js'
import pushRouter from './push.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  // Render 같은 배포 플랫폼은 요청을 프록시(리버스 프록시)를 거쳐 전달해요.
  // 이 설정이 없으면 express-rate-limit이 모든 사용자를 같은 IP로 착각하거나 에러를 던질 수 있어요.
  app.set('trust proxy', 1)

  // CORS: ALLOWED_ORIGINS(콤마로 구분)가 설정되어 있으면 그 목록만 허용, 없으면 개발 편의를 위해 전체 허용(경고 출력)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[경고] ALLOWED_ORIGINS가 설정되어 있지 않아 모든 출처를 허용해요. 운영 환경이라면 설정을 권장해요.')
    }
    app.use(cors())
  } else {
    app.use(cors({ origin: allowedOrigins }))
  }

  app.use(express.json({ limit: '10mb' })) // 처방전 사진(base64)을 받기 위해 넉넉하게 설정

  app.get('/api/health', (req, res) => res.json({ ok: true }))

  // 환자용
  app.use('/api/auth', authRouter)
  app.use('/api/auth', oauthRouter) // /api/auth/google, /api/auth/kakao, /api/auth/naver (+ /callback)
  app.use('/api/bookings', bookingsRouter)
  app.use('/api', hospitalsRouter) // /api/hospitals/search, /api/pharmacies/search, /api/departments
  app.use('/api/prescriptions', prescriptionsRouter)
  app.use('/api/family-members', familyMembersRouter)
  app.use('/api/history', historyRouter)
  app.use('/api/prescriptions/analyze', prescriptionAnalysisRouter)
  app.use('/api/symptom-check', symptomCheckRouter)
  app.use('/api', reviewsRouter) // /api/hospitals/:code/reviews, /api/pharmacies/:code/reviews
  app.use('/api/facility-applications', facilityApplicationsRouter) // 병원/약국 자체 입점 신청
  app.use('/api/push', pushRouter) // /api/push/vapid-public-key, subscribe, unsubscribe

  // 병원/약국 담당자용
  app.use('/api/auth', staffAuthRouter) // /api/auth/staff/login, /api/auth/staff/me
  app.use('/api/hospital', hospitalDashboardRouter) // /api/hospital/bookings, .../:id/confirm|reject, /api/hospital/schedule
  app.use('/api/pharmacy', pharmacyDashboardRouter) // /api/pharmacy/prescriptions, .../:id/accept|reject|ready
  app.use('/api/admin', adminDashboardRouter) // /api/admin/stats, staff-accounts, bookings, prescriptions, notifications, applications

  // 배포(프로덕션) 환경: `npm run build`로 만든 dist/ 폴더를 이 서버가 직접 서빙합니다.
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist')
    app.use(express.static(distPath))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  return app
}
