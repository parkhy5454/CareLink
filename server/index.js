import { createApp } from './app.js'
import { initDb } from './db.js'
import { startReminderScheduler } from './reminders.js'

const app = createApp()

// 배포 플랫폼(Render 등)은 보통 PORT 환경변수로 포트를 지정해줘요.
// 개발 환경(Replit)에서는 프론트(Vite, PORT=3000)와 겹치지 않게 API_PORT(기본 3001)만 사용합니다.
const PORT = process.env.NODE_ENV === 'production'
  ? (process.env.PORT || process.env.API_PORT || 3001)
  : (process.env.API_PORT || 3001)

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] API 서버가 ${PORT} 포트에서 실행 중이에요`)
    })
    startReminderScheduler()
  })
  .catch((err) => {
    console.error('[server] DB 초기화에 실패했어요:', err)
    process.exit(1)
  })
