import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.warn(
    '[경고] DATABASE_URL이 설정되어 있지 않아요. Replit 왼쪽 도구 목록에서 "Database"(PostgreSQL)를 활성화해주세요.'
  )
}

const useSSL = process.env.PGSSL !== 'false'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
})

export async function initDb() {
  // ── users: 전화번호/이메일/구글/카카오/네이버 중 어떤 방식으로 가입해도 하나의 users 행으로 저장 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '회원',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  // 이전 단계 스키마를 가지고 있는 경우를 위한 마이그레이션(있으면 스킵, 없으면 추가)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_id TEXT;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS naver_id TEXT;`)
  await pool.query(`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;`).catch(() => {})
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
      END IF;
    EXCEPTION WHEN duplicate_table THEN NULL;
    END $$;
  `).catch(() => {})
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email) WHERE email IS NOT NULL;`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users (google_id) WHERE google_id IS NOT NULL;`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_kakao_id_key ON users (kakao_id) WHERE kakao_id IS NOT NULL;`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_naver_id_key ON users (naver_id) WHERE naver_id IS NOT NULL;`)
  // 추천인 코드 (본인이 남에게 공유할 코드) + 누구의 추천으로 가입했는지 기록 (보상 시스템은 추후 별도 설계)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_key ON users (referral_code) WHERE referral_code IS NOT NULL;`)
  // 개인정보/이용약관 동의 이력 (가입 시 필수 동의, 마케팅은 선택)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_terms_at TIMESTAMP;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_privacy_at TIMESTAMP;`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_marketing_at TIMESTAMP;`)

  // ── 가족 구성원 (계정 하나로 본인 외 자녀/배우자/부모님 등을 등록해서 그 이름으로 예약 가능) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_members (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT '본인',
      birth_year INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members (user_id);`)

  // ── 전화번호 모의 인증번호 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)

  // ── 이메일 비밀번호 재설정 코드 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)

  // ── 실제 병원 데이터 (건강보험심사평가원 공개 데이터) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospitals (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      sido TEXT,
      sigungu TEXT,
      address TEXT,
      phone TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hospitals_name ON hospitals (name);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hospitals_region ON hospitals (sido, sigungu);`)

  // ── 실제 약국 데이터 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pharmacies (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sido TEXT,
      sigungu TEXT,
      address TEXT,
      phone TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pharmacies_name ON pharmacies (name);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pharmacies_region ON pharmacies (sido, sigungu);`)

  // ── 병원별 진료과목 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_departments (
      hospital_code TEXT NOT NULL REFERENCES hospitals(code) ON DELETE CASCADE,
      dept_name TEXT NOT NULL,
      PRIMARY KEY (hospital_code, dept_name)
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hospital_departments_dept ON hospital_departments (dept_name);`)

  // ── 예약 (병원 승인 전에는 pending, 병원이 확정하면 confirmed, 거절하면 rejected) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hospital_name TEXT NOT NULL,
      appointment_label TEXT NOT NULL,
      booking_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hospital_code TEXT REFERENCES hospitals(code) ON DELETE SET NULL;`).catch(() => {})
  await pool.query(`ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';`).catch(() => {})
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();`)
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL;`).catch(() => {})
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_name TEXT;`)
  // 같은 병원의 같은 시간대는 대기중/확정 상태에서 하나만 존재할 수 있게 강제 (거절되면 다시 열림)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
    ON bookings (hospital_code, appointment_label)
    WHERE status IN ('pending', 'confirmed');
  `)

  // ── 병원/약국/관리자 담당자 계정 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_accounts (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('hospital', 'pharmacy', 'admin')),
      facility_code TEXT,
      facility_name TEXT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_staff_accounts_facility ON staff_accounts (role, facility_code);`)
  // 이전 단계 스키마 마이그레이션: role 체크에 admin 추가, facility_code를 nullable로 변경
  await pool.query(`ALTER TABLE staff_accounts ALTER COLUMN facility_code DROP NOT NULL;`).catch(() => {})
  await pool.query(`ALTER TABLE staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_role_check;`).catch(() => {})
  await pool.query(`ALTER TABLE staff_accounts ADD CONSTRAINT staff_accounts_role_check CHECK (role IN ('hospital', 'pharmacy', 'admin'));`).catch(() => {})

  // ── 처방전 전송 (환자가 처방전 촬영/전송 시 생성, 약국이 수락/거절) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pharmacy_code TEXT REFERENCES pharmacies(code) ON DELETE SET NULL,
      pharmacy_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reject_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy ON prescriptions (pharmacy_code, status);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prescriptions_user ON prescriptions (user_id);`)

  // ── 알림 발송 이력 (카카오 알림톡/SMS/콘솔 로그 등) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT,
      success BOOLEAN NOT NULL DEFAULT true,
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id);`)

  // ── 병원별 진료시간 설정 (비활성화한 슬롯만 저장, 없으면 전체 슬롯이 기본 활성) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_schedule_exceptions (
      hospital_code TEXT NOT NULL REFERENCES hospitals(code) ON DELETE CASCADE,
      slot_label TEXT NOT NULL,
      PRIMARY KEY (hospital_code, slot_label)
    );
  `)

  // ── 병원/약국 리뷰 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_reviews (
      id SERIAL PRIMARY KEY,
      hospital_code TEXT NOT NULL REFERENCES hospitals(code) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hospital_reviews_code ON hospital_reviews (hospital_code);`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hospital_reviews_unique ON hospital_reviews (user_id, booking_id) WHERE booking_id IS NOT NULL;`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_reviews (
      id SERIAL PRIMARY KEY,
      pharmacy_code TEXT NOT NULL REFERENCES pharmacies(code) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pharmacy_reviews_code ON pharmacy_reviews (pharmacy_code);`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_reviews_unique ON pharmacy_reviews (user_id, prescription_id) WHERE prescription_id IS NOT NULL;`)

  // ── 병원/약국 입점(계정 발급) 신청 — 자체 신청 후 관리자가 승인 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facility_applications (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('hospital', 'pharmacy')),
      facility_code TEXT NOT NULL,
      facility_name TEXT,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_email TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMP
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_facility_applications_status ON facility_applications (status);`)

  // ── 처방전 이미지 (분석 시 받은 사진을 약국이 실제로 확인할 수 있도록 저장) ──
  await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS image_base64 TEXT;`)
  await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS image_mime_type TEXT;`)

  // ── 브라우저 웹 푸시 구독 정보 ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);`)

  // ── 복용 기간/횟수 (처방전 사진에서 Gemini가 읽어낸 값, 못 읽으면 NULL) ──
  await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS dosage_total_days INTEGER;`)
  await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS dosage_times_per_day INTEGER;`)

  // ── 복약 알림 스케줄 (조제완료 시점에 복용기간만큼 미리 생성해둠) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medication_reminders (
      id SERIAL PRIMARY KEY,
      prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal TEXT NOT NULL,
      scheduled_at TIMESTAMP NOT NULL,
      sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_medication_reminders_due ON medication_reminders (sent, scheduled_at);`)
}
