// 복약 알림은 한국 시간(KST, UTC+9) 기준 아침 8시 / 점심 12시 / 저녁 7시로 고정입니다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const MEAL_HOURS = { breakfast: 8, lunch: 12, dinner: 19 }
export const MEAL_LABELS = { breakfast: '아침', lunch: '점심', dinner: '저녁' }

// 하루 투여 횟수를 어떤 끼니에 배치할지 정합니다. 알 수 없으면(null/0) 알림을 만들지 않아요.
export function mealsForTimesPerDay(timesPerDay) {
  if (!timesPerDay || timesPerDay <= 0) return null
  if (timesPerDay === 1) return ['dinner']
  if (timesPerDay === 2) return ['breakfast', 'dinner']
  return ['breakfast', 'lunch', 'dinner'] // 3회 이상은 3끼 기준으로 맞춤
}

// dayOffset(0=오늘)일 뒤의 KST hour:00 시각을, 실제 UTC Date 인스턴스로 반환합니다.
function kstDateAtHour(nowUtc, dayOffset, hour) {
  const kstNow = new Date(nowUtc.getTime() + KST_OFFSET_MS)
  const y = kstNow.getUTCFullYear()
  const m = kstNow.getUTCMonth()
  const d = kstNow.getUTCDate()
  const targetKstWallTime = new Date(Date.UTC(y, m, d + dayOffset, hour, 0, 0))
  return new Date(targetKstWallTime.getTime() - KST_OFFSET_MS)
}

// 처방 조제완료 시점부터 totalDays일 동안, timesPerDay에 맞는 끼니마다 알림 시각을 만들어줍니다.
// 이미 지난 시각(예: 오늘 아침 8시가 지난 뒤 조제완료된 경우)은 자동으로 제외돼요.
export function buildReminderSchedule(totalDays, timesPerDay, now = new Date()) {
  const meals = mealsForTimesPerDay(timesPerDay)
  if (!meals || !totalDays || totalDays <= 0) return []

  const schedule = []
  for (let day = 0; day < totalDays; day++) {
    for (const meal of meals) {
      const scheduledAt = kstDateAtHour(now, day, MEAL_HOURS[meal])
      if (scheduledAt.getTime() > now.getTime()) {
        schedule.push({ meal, scheduledAt })
      }
    }
  }
  return schedule
}
