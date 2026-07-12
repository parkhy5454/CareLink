// 실제 병원별 예약 시스템이 없는 상태라, 병원마다 같은 시간표(요일 4개 x 시간 5개 = 20개 슬롯)를
// 예약 가능한 시간으로 사용합니다. 이미 예약(대기중/확정)된 슬롯은 다른 환자에게 보이지 않습니다.
export const DAY_LABELS = ['내일', '모레', '이번 주 목요일', '이번 주 금요일']
export const TIME_LABELS = ['오전 9시 30분', '오전 10시', '오전 11시', '오후 2시', '오후 3시 30분']

export function allSlotLabels() {
  const labels = []
  for (const day of DAY_LABELS) {
    for (const time of TIME_LABELS) {
      labels.push(`${day} ${time}`)
    }
  }
  return labels
}
