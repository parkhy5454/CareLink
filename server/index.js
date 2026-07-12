import { createApp } from './app.js'
import { initDb } from './db.js'
import { startReminderScheduler } from './reminders.js'

const app = createApp()
const PORT = process.env.API_PORT || 3001

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
