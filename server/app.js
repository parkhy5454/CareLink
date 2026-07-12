import express from 'express'
import cors from 'cors'
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

export function createApp() {
  const app = express()

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

  return app
}
