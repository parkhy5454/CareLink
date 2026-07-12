const STAFF_TOKEN_KEY = 'naegeongang_staff_token'

export function getStaffToken() {
  return localStorage.getItem(STAFF_TOKEN_KEY)
}

export function setStaffToken(token) {
  localStorage.setItem(STAFF_TOKEN_KEY, token)
}

export function clearStaffToken() {
  localStorage.removeItem(STAFF_TOKEN_KEY)
}

async function request(path, options = {}) {
  const token = getStaffToken()

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

export const staffApi = {
  login: (username, password) => request('/auth/staff/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/staff/me'),

  // 병원
  hospitalBookings: (status) => request(`/hospital/bookings${status ? `?status=${status}` : ''}`),
  confirmBooking: (id) => request(`/hospital/bookings/${id}/confirm`, { method: 'POST' }),
  rejectBooking: (id) => request(`/hospital/bookings/${id}/reject`, { method: 'POST' }),
  hospitalSchedule: () => request('/hospital/schedule'),
  saveHospitalSchedule: (disabledLabels) =>
    request('/hospital/schedule', { method: 'POST', body: { disabledLabels } }),

  // 약국
  pharmacyPrescriptions: (status) => request(`/pharmacy/prescriptions${status ? `?status=${status}` : ''}`),
  acceptPrescription: (id) => request(`/pharmacy/prescriptions/${id}/accept`, { method: 'POST' }),
  rejectPrescription: (id, reason) =>
    request(`/pharmacy/prescriptions/${id}/reject`, { method: 'POST', body: { reason } }),
  readyPrescription: (id) => request(`/pharmacy/prescriptions/${id}/ready`, { method: 'POST' }),
  prescriptionImage: (id) => request(`/pharmacy/prescriptions/${id}/image`),

  // 관리자
  adminStats: () => request('/admin/stats'),
  adminTimeseries: (days) => request(`/admin/stats/timeseries?days=${days || 14}`),
  adminStaffList: (role) => request(`/admin/staff-accounts${role ? `?role=${role}` : ''}`),
  adminCreateStaff: (payload) => request('/admin/staff-accounts', { method: 'POST', body: payload }),
  adminDeleteStaff: (id) => request(`/admin/staff-accounts/${id}`, { method: 'DELETE' }),
  adminBookings: (limit) => request(`/admin/bookings?limit=${limit || 50}`),
  adminPrescriptions: (limit) => request(`/admin/prescriptions?limit=${limit || 50}`),
  adminNotifications: (limit) => request(`/admin/notifications?limit=${limit || 50}`),
  adminApplications: (status) => request(`/admin/applications${status ? `?status=${status}` : ''}`),
  adminApproveApplication: (id, username, password) =>
    request(`/admin/applications/${id}/approve`, { method: 'POST', body: { username, password } }),
  adminRejectApplication: (id) => request(`/admin/applications/${id}/reject`, { method: 'POST' })
}
