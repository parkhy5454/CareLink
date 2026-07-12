import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'

const router = Router()

// 2026년 6월 기준 Gemini 2.0 계열은 종료되어 3.5 Flash를 기본으로 사용합니다.
const MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-3.5-flash'

const checkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요' },
  handler: (req, res, _next, options) => res.status(429).json(options.message)
})

// 우리 DB에 실제로 있는 진료과목 목록을 캐싱해서, Gemini가 존재하지 않는 진료과를 추천하지 않게 합니다.
let deptCache = null
let deptCacheAt = 0
const DEPT_CACHE_TTL_MS = 60 * 60 * 1000

async function getValidDepartments() {
  if (deptCache && Date.now() - deptCacheAt < DEPT_CACHE_TTL_MS) return deptCache
  const { rows } = await pool.query(
    `SELECT dept_name, COUNT(*) AS cnt FROM hospital_departments GROUP BY dept_name ORDER BY cnt DESC LIMIT 60`
  )
  deptCache = rows.map((r) => r.dept_name)
  deptCacheAt = Date.now()
  return deptCache
}

function buildSchema(validDepartments) {
  return {
    type: 'OBJECT',
    properties: {
      urgent: { type: 'BOOLEAN' },
      urgentMessage: { type: 'STRING' },
      departments: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', enum: validDepartments },
            reason: { type: 'STRING' }
          },
          required: ['name', 'reason']
        }
      }
    },
    required: ['urgent', 'departments']
  }
}

function buildPrompt(symptomText) {
  return `사용자가 자신의 증상을 다음과 같이 설명했습니다: "${symptomText}"

이 증상에 적합한 진료과목을 추천해주세요. 다음을 지켜주세요:
1. 최대 3개까지, 가장 적합한 순서로 진료과목을 추천하고 각각 왜 그 진료과가 맞는지 1문장으로 설명해주세요(reason).
2. 반드시 지정된 진료과목 목록(enum) 중에서만 골라주세요.
3. 특정 질병명을 확정 진단하지 마세요. "~일 수 있어요" 같은 가능성 표현만 쓰고, 진료과 안내에 집중하세요.
4. 호흡곤란, 심한 흉통, 의식저하, 심한 출혈 등 응급 증상으로 보이면 urgent를 true로 하고, urgentMessage에 "119에 연락하거나 응급실을 방문하세요" 같은 안내를 넣어주세요.
5. 증상이 불명확하거나 이 목록으로 판단하기 어려우면 가장 가능성 높은 과 1~2개만 추천하세요.

반드시 지정된 JSON 스키마 형식으로만 응답하세요.`
}

router.post('/', authMiddleware, checkLimiter, async (req, res) => {
  try {
    const symptomText = String(req.body.symptomText || '').trim().slice(0, 500)
    if (symptomText.length < 2) {
      return res.status(400).json({ error: '증상을 조금 더 자세히 입력해주세요' })
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return res.status(501).json({
        error: 'Google AI 연동이 설정되지 않았어요. 관리자에게 GOOGLE_AI_API_KEY 설정을 요청해주세요.',
        notConfigured: true
      })
    }

    const validDepartments = await getValidDepartments()

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(symptomText) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: buildSchema(validDepartments)
          }
        })
      }
    )

    const data = await geminiRes.json()

    if (!geminiRes.ok) {
      console.error('[gemini] 증상 분석 API 오류', data)
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
    } catch {
      console.error('[gemini] JSON 파싱 실패', text.slice(0, 500))
      return res.status(502).json({ error: '분석 결과를 처리하지 못했어요. 다시 시도해주세요' })
    }

    res.json({
      urgent: Boolean(parsed.urgent),
      urgentMessage: parsed.urgentMessage || null,
      departments: Array.isArray(parsed.departments) ? parsed.departments.slice(0, 3) : []
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '증상을 분석하는 중 문제가 발생했어요' })
  }
})

export default router
