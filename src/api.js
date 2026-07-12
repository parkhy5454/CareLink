const TOKEN_KEY = 'naegeongang_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const token = getToken()

  const res = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || '요청 처리 중 문제가 발생했어요')
  }

  return data
}

export const api = {
  // 전화번호 + 모의 인증번호
  requestCode: (phone) => request('/auth/request-code', { method: 'POST', body: { phone } }),
  verifyCode: (phone, code, consent = {}) =>
    request('/auth/verify', { method: 'POST', body: { phone, code, ...consent } }),

  // 이메일 + 비밀번호
  emailSignup: (name, email, password, consent = {}) =>
    request('/auth/email/signup', { method: 'POST', body: { name, email, password, ...consent } }),
  emailLogin: (email, password) =>
    request('/auth/email/login', { method: 'POST', body: { email, password } }),
  forgotPassword: (email) => request('/auth/email/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (email, code, newPassword) =>
    request('/auth/email/reset-password', { method: 'POST', body: { email, code, newPassword } }),

  // 세션 확인 / 탈퇴
  me: () => request('/auth/me'),
  deleteAccount: (password) => request('/auth/me', { method: 'DELETE', body: { password } }),

  // 예약
  latestBooking: () => request('/bookings/latest'),
  hospitalSlots: (hospitalCode) => request(`/hospitals/${hospitalCode}/slots`),
  createBooking: (hospitalCode, appointmentLabel, patientId) =>
    request('/bookings', { method: 'POST', body: { hospitalCode, appointmentLabel, patientId } }),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  // 가족 구성원 (본인 포함, 예약 대상 선택용)
  familyMembers: () => request('/family-members'),
  addFamilyMember: (name, relationship, birthYear) =>
    request('/family-members', { method: 'POST', body: { name, relationship, birthYear } }),
  updateFamilyMember: (id, payload) => request(`/family-members/${id}`, { method: 'PATCH', body: payload }),
  removeFamilyMember: (id) => request(`/family-members/${id}`, { method: 'DELETE' }),

  // 진료/처방 통합 기록 (내 정보 화면)
  history: (patientId) => request(`/history${patientId ? `?patientId=${patientId}` : ''}`),

  // 처방전 전송/조회
  sendPrescription: (bookingId, pharmacyCode, imageBase64, imageMimeType, dosage = {}) =>
    request('/prescriptions', {
      method: 'POST',
      body: { bookingId, pharmacyCode, imageBase64, imageMimeType, ...dosage }
    }),
  analyzePrescription: (imageBase64, mimeType) =>
    request('/prescriptions/analyze', { method: 'POST', body: { imageBase64, mimeType } }),
  checkSymptoms: (symptomText) =>
    request('/symptom-check', { method: 'POST', body: { symptomText } }),
  latestPrescription: () => request('/prescriptions/latest'),
  resendPrescription: (id, pharmacyCode) =>
    request(`/prescriptions/${id}/resend`, { method: 'POST', body: { pharmacyCode } }),

  // 병원/약국 검색 (실제 데이터)
  searchHospitals: (q, extra = {}) => {
    const params = new URLSearchParams({ q, ...extra })
    return request(`/hospitals/search?${params.toString()}`)
  },
  searchPharmacies: (params = {}) => {
    const qs = new URLSearchParams(params)
    return request(`/pharmacies/search?${qs.toString()}`)
  },
  departments: () => request('/departments'),

  // 리뷰
  hospitalReviews: (code) => request(`/hospitals/${code}/reviews`),
  addHospitalReview: (code, rating, comment, bookingId) =>
    request(`/hospitals/${code}/reviews`, { method: 'POST', body: { rating, comment, bookingId } }),
  pharmacyReviews: (code) => request(`/pharmacies/${code}/reviews`),
  addPharmacyReview: (code, rating, comment, prescriptionId) =>
    request(`/pharmacies/${code}/reviews`, { method: 'POST', body: { rating, comment, prescriptionId } }),

  // 병원/약국 자체 입점 신청 (로그인 불필요)
  submitFacilityApplication: (payload) =>
    request('/facility-applications', { method: 'POST', body: payload }),

  // 브라우저 웹 푸시
  pushVapidKey: () => request('/push/vapid-public-key'),
  pushSubscribe: (subscription) => request('/push/subscribe', { method: 'POST', body: { subscription } }),
  pushUnsubscribe: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } })
}

// 소셜 로그인은 전체 페이지 리다이렉트 방식이라 그냥 이동시키면 됩니다.
export const oauthUrls = {
  google: '/api/auth/google',
  kakao: '/api/auth/kakao',
  naver: '/api/auth/naver'
}
