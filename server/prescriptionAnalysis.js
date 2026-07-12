import { Router } from 'express'
import { authMiddleware } from './auth.js'

const router = Router()

// 2026년 6월 기준 Gemini 2.0 계열은 종료되어 3.5 Flash를 기본으로 사용합니다.
// 필요하면 GOOGLE_AI_MODEL 환경변수로 다른 모델 이름을 지정할 수 있어요.
const MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-3.5-flash'

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    readable: { type: 'BOOLEAN' },
    patientName: { type: 'STRING' },
    hospitalName: { type: 'STRING' },
    dosageTotalDays: { type: 'INTEGER' },
    dosageTimesPerDay: { type: 'INTEGER' },
    medications: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          ingredient: { type: 'STRING' },
          effect: { type: 'STRING' },
          precautions: { type: 'STRING' }
        },
        required: ['name', 'effect', 'precautions']
      }
    }
  },
  required: ['readable', 'medications']
}

const PROMPT = `이 이미지는 처방전 또는 약 봉투 사진입니다. 다음을 한국어로 수행해주세요:

1. 이미지에서 처방된 약 이름들을 읽어주세요.
2. 각 약마다: 약품명(name), 주요 성분명(ingredient), 효능·효과를 일반인이 이해하기 쉽게 1~2문장으로(effect), 복용 시 주의사항을 1~2문장으로(precautions) 알려주세요.
3. 이미지가 처방전이 아니거나 글자를 알아볼 수 없으면 readable을 false로 하고 medications는 빈 배열로 응답하세요.
4. 이미지에서 환자 이름이나 병원 이름이 보이면 patientName, hospitalName에 넣어주세요 (안 보이면 생략).
5. 이미지에 "총 투약일수"나 "3일분", "5일분" 같은 복용 기간이 보이면 dosageTotalDays에 숫자만 넣어주세요. "1일 3회", "1일 2회" 같은 하루 복용 횟수가 보이면 dosageTimesPerDay에 숫자만 넣어주세요. 여러 약의 횟수가 다르면 가장 많이 나오는 값을 대표로 사용하세요. 둘 다 확실하지 않으면 필드 자체를 생략하세요 (추측해서 채우지 마세요).
6. 의학적 진단이나 개인 맞춤 처방 변경 제안은 하지 마세요. 일반적인 약품 설명만 제공하세요.

반드시 지정된 JSON 스키마 형식으로만 응답하세요.`

router.post('/', authMiddleware, async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return res.status(501).json({
        error: 'Google AI 연동이 설정되지 않았어요. 관리자에게 GOOGLE_AI_API_KEY 설정을 요청해주세요.',
        notConfigured: true
      })
    }

    const { imageBase64, mimeType } = req.body
    if (!imageBase64) {
      return res.status(400).json({ error: '분석할 이미지가 없어요' })
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA
          }
        })
      }
    )

    const data = await geminiRes.json()

    if (!geminiRes.ok) {
      console.error('[gemini] API 오류', data)
      return res.status(502).json({ error: 'Google AI 분석 중 문제가 발생했어요. 잠시 후 다시 시도해주세요' })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      console.error('[gemini] 예상치 못한 응답 구조', JSON.stringify(data).slice(0, 500))
      return res.status(502).json({ error: 'Google AI 응답을 이해하지 못했어요. 다시 시도해주세요' })
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      console.error('[gemini] JSON 파싱 실패', text.slice(0, 500))
      return res.status(502).json({ error: '분석 결과를 처리하지 못했어요. 다시 시도해주세요' })
    }

    res.json({
      readable: Boolean(parsed.readable),
      patientName: parsed.patientName || null,
      hospitalName: parsed.hospitalName || null,
      dosageTotalDays: Number.isInteger(parsed.dosageTotalDays) ? parsed.dosageTotalDays : null,
      dosageTimesPerDay: Number.isInteger(parsed.dosageTimesPerDay) ? parsed.dosageTimesPerDay : null,
      medications: Array.isArray(parsed.medications) ? parsed.medications : []
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처방전을 분석하는 중 문제가 발생했어요' })
  }
})

export default router
