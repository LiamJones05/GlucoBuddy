-- ============================================================
-- GlucoBuddy PostgreSQL Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id              INTEGER      NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    correction_ratio     NUMERIC(6,2) NOT NULL,
    target_min           NUMERIC(5,2) NOT NULL,
    target_max           NUMERIC(5,2) NOT NULL,
    carb_ratio_morning   NUMERIC(6,2) NOT NULL,
    carb_ratio_afternoon NUMERIC(6,2) NOT NULL,
    carb_ratio_evening   NUMERIC(6,2) NOT NULL,
    adaptive_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    adaptive_params      TEXT,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS glucose_logs (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    glucose_level NUMERIC(5,2) NOT NULL,
    logged_date   DATE         NOT NULL,
    logged_time   TIME(0)      NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insulin_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    units        NUMERIC(6,2) NOT NULL,
    insulin_type VARCHAR(50)  NOT NULL,
    logged_date  DATE         NOT NULL,
    logged_time  TIME(0)      NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_logs (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    carbs      NUMERIC(6,2) NOT NULL,
    protein    NUMERIC(6,2) NOT NULL,
    logged_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dose_calculations (
    id                     SERIAL PRIMARY KEY,
    user_id                INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    glucose_input          NUMERIC(6,2) NOT NULL,
    carbs_input            NUMERIC(6,2) NOT NULL,
    recommended_dose       NUMERIC(6,2) NOT NULL,
    confirmed_administered BOOLEAN      NOT NULL DEFAULT FALSE,
    outcome_glucose        NUMERIC(5,2),
    outcome_recorded_at    TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ix_glucose_logs_user_date_time
    ON glucose_logs (user_id, logged_date, logged_time);

CREATE INDEX IF NOT EXISTS ix_insulin_logs_user_date_time
    ON insulin_logs (user_id, logged_date, logged_time);

CREATE INDEX IF NOT EXISTS ix_meal_logs_user_logged_at
    ON meal_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS ix_dose_calculations_user_created_at
    ON dose_calculations (user_id, created_at DESC);
