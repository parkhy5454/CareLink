import { Router } from 'express'
import crypto from 'crypto'
import { pool } from './db.js'
import { issueToken } from './auth.js'

const router = Router()

// 프론트엔드로 로그인 결과를 돌려줄 때 쓰는 기본 주소.
// Replit에서는 보통 프론트(Vite, 3000)와 백엔드(3001)가 같은 호스트에서 프록시로 묶여 있으므로
// "/"로 상대 경로 리다이렉트하면 됩니다.
const FRONTEND_URL = process.env.FRONTEND_URL || '/'

function redirectWithToken(res, token) {
  res.redirect(`${FRONTEND_URL}#token=${token}`)
}

function redirectWithError(res, code) {
  res.redirect(`${FRONTEND_URL}#error=${code}`)
}

// 소셜 계정으로 로그인/가입 처리 공용 함수
async function upsertSocialUser({ column, id, name, email }) {
  const { rows: existing } = await pool.query(`SELECT * FROM users WHERE ${column} = $1`, [id])
  if (existing.length > 0) return existing[0]

  // 같은 이메일로 이미 가입된 계정이 있으면 소셜 계정을 그 계정에 연결
  if (email) {
    const { rows: byEmail } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (byEmail.length > 0) {
      const { rows: linked } = await pool.query(
        `UPDATE users SET ${column} = $1 WHERE id = $2 RETURNING *`,
        [id, byEmail[0].id]
      )
      return linked[0]
    }
  }

  const { rows: inserted } = await pool.query(
    `INSERT INTO users (${column}, name, email) VALUES ($1, $2, $3) RETURNING *`,
    [id, name || '회원', email || null]
  )
  const newUser = inserted[0]
  await pool.query(
    `INSERT INTO family_members (user_id, name, relationship) VALUES ($1, $2, '본인')`,
    [newUser.id, newUser.name]
  )
  // 소셜 로그인 버튼은 프론트엔드에서 약관 동의 체크 후에만 눌리므로, 가입 시점에 동의로 기록해요
  await pool.query(
    `UPDATE users SET agreed_terms_at = now(), agreed_privacy_at = now() WHERE id = $1`,
    [newUser.id]
  )
  return newUser
}

// ───────────────────────── Google ─────────────────────────

router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return redirectWithError(res, 'google_not_configured')
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('prompt', 'select_account')
  res.redirect(url.toString())
})

router.get('/google/callback', async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
    const { code } = req.query
    if (!code || !clientId || !clientSecret || !redirectUri) {
      return redirectWithError(res, 'google_not_configured')
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[google oauth] token error', tokenData)
      return redirectWithError(res, 'google_login_failed')
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()

    const user = await upsertSocialUser({
      column: 'google_id',
      id: profile.sub,
      name: profile.name,
      email: profile.email
    })

    redirectWithToken(res, issueToken(user))
  } catch (err) {
    console.error(err)
    redirectWithError(res, 'google_login_failed')
  }
})

// ───────────────────────── Kakao ─────────────────────────

router.get('/kakao', (req, res) => {
  const clientId = process.env.KAKAO_CLIENT_ID
  const redirectUri = process.env.KAKAO_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return redirectWithError(res, 'kakao_not_configured')
  }

  const url = new URL('https://kauth.kakao.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  res.redirect(url.toString())
})

router.get('/kakao/callback', async (req, res) => {
  try {
    const clientId = process.env.KAKAO_CLIENT_ID
    const clientSecret = process.env.KAKAO_CLIENT_SECRET // 카카오 앱 설정에서 켰다면 필요, 아니면 비워둬도 됨
    const redirectUri = process.env.KAKAO_REDIRECT_URI
    const { code } = req.query
    if (!code || !clientId || !redirectUri) {
      return redirectWithError(res, 'kakao_not_configured')
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code
    })
    if (clientSecret) body.set('client_secret', clientSecret)

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[kakao oauth] token error', tokenData)
      return redirectWithError(res, 'kakao_login_failed')
    }

    const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()
    const account = profile.kakao_account || {}

    const user = await upsertSocialUser({
      column: 'kakao_id',
      id: String(profile.id),
      name: account.profile?.nickname,
      email: account.email
    })

    redirectWithToken(res, issueToken(user))
  } catch (err) {
    console.error(err)
    redirectWithError(res, 'kakao_login_failed')
  }
})

// ───────────────────────── Naver ─────────────────────────

router.get('/naver', (req, res) => {
  const clientId = process.env.NAVER_CLIENT_ID
  const redirectUri = process.env.NAVER_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return redirectWithError(res, 'naver_not_configured')
  }

  const state = crypto.randomBytes(8).toString('hex')
  const url = new URL('https://nid.naver.com/oauth2.0/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  res.redirect(url.toString())
})

router.get('/naver/callback', async (req, res) => {
  try {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET
    const redirectUri = process.env.NAVER_REDIRECT_URI
    const { code, state } = req.query
    if (!code || !clientId || !clientSecret || !redirectUri) {
      return redirectWithError(res, 'naver_not_configured')
    }

    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token')
    tokenUrl.searchParams.set('grant_type', 'authorization_code')
    tokenUrl.searchParams.set('client_id', clientId)
    tokenUrl.searchParams.set('client_secret', clientSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)
    tokenUrl.searchParams.set('state', state)

    const tokenRes = await fetch(tokenUrl.toString())
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[naver oauth] token error', tokenData)
      return redirectWithError(res, 'naver_login_failed')
    }

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profileData = await profileRes.json()
    const profile = profileData.response || {}

    const user = await upsertSocialUser({
      column: 'naver_id',
      id: profile.id,
      name: profile.name || profile.nickname,
      email: profile.email
    })

    redirectWithToken(res, issueToken(user))
  } catch (err) {
    console.error(err)
    redirectWithError(res, 'naver_login_failed')
  }
})

export default router
