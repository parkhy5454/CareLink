import { pool } from './db.js'
import { sendPushToUser } from './push.js'
import { buildReminderSchedule, MEAL_LABELS } from './mealSchedule.js'

// 약국이 '조제 완료' 처리할 때 호출합니다. 처방전에 저장된 복용일수/횟수가 있으면
// 그 기간만큼 아침/점심/저녁 알림 시각을 미리 계산해서 저장해둡니다.
export async function scheduleRemindersForPrescription(prescription) {
  const { id: prescriptionId, user_id: userId, dosage_total_days: totalDays, dosage_times_per_day: timesPerDay } = prescription
  const schedule = buildReminderSchedule(totalDays, timesPerDay)
  if (schedule.length === 0) return { created: 0 }

  const values = []
  const params = []
  schedule.forEach(({ meal, scheduledAt }, idx) => {
    const base = idx * 4
    values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4})`)
    params.push(prescriptionId, userId, meal, scheduledAt)
  })

  await pool.query(
    `INSERT INTO medication_reminders (prescription_id, user_id, meal, scheduled_at) VALUES ${values.join(',')}`,
    params
  )

  return { created: schedule.length }
}

async function logPushAttempt(userId, message, success, error) {
  try {
    await pool.query(
      `INSERT INTO notification_log (user_id, channel, event, message, success, error)
       VALUES ($1, 'push', 'medication_reminder', $2, $3, $4)`,
      [userId || null, message, success, error || null]
    )
  } catch (e) {
    console.error('[reminders] 로그 저장 실패', e)
  }
}

// 발송 시각이 지난 알림들을 찾아 웹 푸시로 보내고 sent=true로 표시합니다.
export async function sendDueReminders() {
  const { rows } = await pool.query(
    `SELECT r.*, p.pharmacy_name
     FROM medication_reminders r
     JOIN prescriptions p ON p.id = r.prescription_id
     WHERE r.sent = false AND r.scheduled_at <= now()
     ORDER BY r.scheduled_at ASC
     LIMIT 200`
  )

  for (const reminder of rows) {
    const mealLabel = MEAL_LABELS[reminder.meal] || reminder.meal
    const message = `${mealLabel} 식사 후 약 드실 시간이에요 (${reminder.pharmacy_name || '약국'} 처방)`

    const result = await sendPushToUser(reminder.user_id, { title: '약 드실 시간이에요', body: message })
    await pool.query('UPDATE medication_reminders SET sent = true WHERE id = $1', [reminder.id])
    if (result.attempted > 0) {
      await logPushAttempt(reminder.user_id, message, result.sent > 0, result.sent === 0 ? '발송 실패' : null)
    }
  }

  return { checked: rows.length }
}

let intervalHandle = null

// 서버 시작 시 한 번 호출해서 주기적으로 발송 대상이 있는지 확인합니다.
export function startReminderScheduler(intervalMs = 60 * 1000) {
  if (intervalHandle) return // 중복 시작 방지
  intervalHandle = setInterval(() => {
    sendDueReminders().catch((err) => console.error('[reminders] 발송 확인 중 오류', err))
  }, intervalMs)
  console.log(`[reminders] 복약 알림 스케줄러 시작 (${intervalMs / 1000}초마다 확인)`)
}

export function stopReminderScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
