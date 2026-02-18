-- 005_sim_replay_tables.sql
-- Mirror of the simulation's 7 PostgreSQL tables for replay mode.
-- Data is loaded via pg_dump/psql from the sim's local DB.
-- Schema source: DatabaseSchema.java in the sim repo.

-- ── Time Series ──────────────────────────────────────────────────

CREATE TABLE sim_time_series (
  sim_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  series_name TEXT NOT NULL,
  good_type TEXT NOT NULL DEFAULT '',
  value DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (sim_date, currency, category, series_name, good_type)
);

CREATE INDEX idx_sim_ts_currency_cat ON sim_time_series (currency, category, series_name);
CREATE INDEX idx_sim_ts_date ON sim_time_series (sim_date);
CREATE INDEX idx_sim_ts_replay ON sim_time_series (currency, category, series_name, good_type, sim_date);

-- ── OHLCV Prices ─────────────────────────────────────────────────

CREATE TABLE sim_ohlcv_prices (
  sim_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  open_price DOUBLE PRECISION,
  high_price DOUBLE PRECISION,
  low_price DOUBLE PRECISION,
  close_price DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  PRIMARY KEY (sim_date, currency, asset_type, asset_name)
);

CREATE INDEX idx_sim_ohlcv_currency ON sim_ohlcv_prices (currency, asset_type, asset_name);
CREATE INDEX idx_sim_ohlcv_date ON sim_ohlcv_prices (sim_date);
CREATE INDEX idx_sim_ohlcv_replay ON sim_ohlcv_prices (currency, asset_type, asset_name, sim_date);

-- ── Balance Sheets ───────────────────────────────────────────────

CREATE TABLE sim_balance_sheets (
  sim_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  hard_cash DOUBLE PRECISION DEFAULT 0,
  cash_giro_short DOUBLE PRECISION DEFAULT 0,
  cash_giro_long DOUBLE PRECISION DEFAULT 0,
  cash_cb_short DOUBLE PRECISION DEFAULT 0,
  cash_cb_long DOUBLE PRECISION DEFAULT 0,
  cash_foreign DOUBLE PRECISION DEFAULT 0,
  bonds DOUBLE PRECISION DEFAULT 0,
  bank_loans DOUBLE PRECISION DEFAULT 0,
  inventory_value DOUBLE PRECISION DEFAULT 0,
  loans_giro_short DOUBLE PRECISION DEFAULT 0,
  loans_giro_long DOUBLE PRECISION DEFAULT 0,
  loans_cb_short DOUBLE PRECISION DEFAULT 0,
  loans_cb_long DOUBLE PRECISION DEFAULT 0,
  financial_liabilities DOUBLE PRECISION DEFAULT 0,
  bank_borrowings DOUBLE PRECISION DEFAULT 0,
  equity DOUBLE PRECISION DEFAULT 0,
  PRIMARY KEY (sim_date, currency, agent_type)
);

CREATE INDEX idx_sim_bs_currency_agent ON sim_balance_sheets (currency, agent_type);
CREATE INDEX idx_sim_bs_date ON sim_balance_sheets (sim_date);
CREATE INDEX idx_sim_bs_replay ON sim_balance_sheets (currency, agent_type, sim_date);

-- ── Monetary Transactions ────────────────────────────────────────

CREATE TABLE sim_monetary_transactions (
  sim_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  from_type TEXT NOT NULL,
  to_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (sim_date, currency, from_type, to_type)
);

CREATE INDEX idx_sim_mt_currency ON sim_monetary_transactions (currency, from_type, to_type);
CREATE INDEX idx_sim_mt_date ON sim_monetary_transactions (sim_date);

-- ── Percentage Series ────────────────────────────────────────────

CREATE TABLE sim_percentage_series (
  sim_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  component TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (sim_date, currency, category, component)
);

CREATE INDEX idx_sim_ps_currency_cat ON sim_percentage_series (currency, category);
CREATE INDEX idx_sim_ps_date ON sim_percentage_series (sim_date);

-- ── Sim Metadata ─────────────────────────────────────────────────
-- Note: the sim's source table is already called "sim_metadata",
-- so the Supabase table keeps the same name (no double-prefix).

CREATE TABLE sim_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Config Changes ───────────────────────────────────────────────

CREATE TABLE sim_config_changes (
  id BIGSERIAL PRIMARY KEY,
  sim_date TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  setting_key TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  rule_id TEXT DEFAULT '',
  rule_title TEXT DEFAULT '',
  intensity TEXT DEFAULT '',
  explanation TEXT DEFAULT ''
);

CREATE INDEX idx_sim_cc_date ON sim_config_changes (sim_date);
