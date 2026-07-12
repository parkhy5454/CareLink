// 비밀번호 재설정 이메일 발송. Resend(https://resend.com)를 기본으로 지원하고,
// RESEND_API_KEY가 없으면 실제 발송 대신 콘솔에 코드를 출력합니다 (데모/개발용).
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAIL_FROM = process.env.MAIL_FROM || 'onboarding@resend.dev'

export async function sendResetEmail(email, code) {
  if (!RESEND_API_KEY) {
    console.log(`[이메일 시뮬레이션 → ${email}] 비밀번호 재설정 코드: ${code}`)
    return { simulated: true }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject: '[내건강] 비밀번호 재설정 코드',
        html: `<p>비밀번호 재설정 코드는 <b>${code}</b> 입니다.</p><p>5분 이내에 입력해주세요.</p>`
      })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[mailer] 발송 실패', data)
      return { simulated: false, success: false }
    }
    return { simulated: false, success: true }
  } catch (err) {
    console.error('[mailer] 발송 중 오류', err)
    return { simulated: false, success: false }
  }
}
