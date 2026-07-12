import { describe, test, expect } from 'vitest'
import { mealsForTimesPerDay, buildReminderSchedule } from '../mealSchedule.js'

describe('mealsForTimesPerDay', () => {
  test('1회면 저녁만', () => {
    expect(mealsForTimesPerDay(1)).toEqual(['dinner'])
  })
  test('2회면 아침+저녁', () => {
    expect(mealsForTimesPerDay(2)).toEqual(['breakfast', 'dinner'])
  })
  test('3회 이상이면 아침+점심+저녁', () => {
    expect(mealsForTimesPerDay(3)).toEqual(['breakfast', 'lunch', 'dinner'])
    expect(mealsForTimesPerDay(4)).toEqual(['breakfast', 'lunch', 'dinner'])
  })
  test('0이나 null이면 null (알림 없음)', () => {
    expect(mealsForTimesPerDay(0)).toBeNull()
    expect(mealsForTimesPerDay(null)).toBeNull()
    expect(mealsForTimesPerDay(undefined)).toBeNull()
  })
})

describe('buildReminderSchedule', () => {
  test('복용일수나 횟수가 없으면 빈 배열', () => {
    expect(buildReminderSchedule(null, 3)).toEqual([])
    expect(buildReminderSchedule(5, null)).toEqual([])
    expect(buildReminderSchedule(0, 3)).toEqual([])
  })

  test('KST 오전 6시(=UTC 전날 21시)에 3일치 3회 처방이면, 오늘 아침부터 포함해 총 9개 슬롯', () => {
    // KST 06:00 == UTC 전날 21:00
    const now = new Date('2026-07-09T21:00:00.000Z') // KST로는 2026-07-10 06:00
    const schedule = buildReminderSchedule(3, 3, now)
    expect(schedule).toHaveLength(9) // 3일 * 3끼, 아직 아무 시간도 안 지났으므로 전부 포함
    expect(schedule[0].meal).toBe('breakfast')
  })

  test('KST 오후 9시(저녁 시간 이후)에 처방되면 오늘 슬롯은 다 지나서 제외된다', () => {
    // KST 21:00 == UTC 12:00
    const now = new Date('2026-07-10T12:00:00.000Z') // KST로는 2026-07-10 21:00
    const schedule = buildReminderSchedule(2, 3, now)
    // 오늘(day0)은 3끼 모두 지났으니 제외, 내일(day1)만 3끼 포함 -> 총 3개
    expect(schedule).toHaveLength(3)
    expect(schedule.every((s) => s.scheduledAt.getTime() > now.getTime())).toBe(true)
  })

  test('1일 1회 5일치면 저녁 슬롯만 5개(아직 아무 것도 안 지난 경우)', () => {
    const now = new Date('2026-07-09T21:00:00.000Z') // KST 06:00
    const schedule = buildReminderSchedule(5, 1, now)
    expect(schedule).toHaveLength(5)
    expect(schedule.every((s) => s.meal === 'dinner')).toBe(true)
  })
})
