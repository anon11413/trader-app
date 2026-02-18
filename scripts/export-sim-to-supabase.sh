#!/bin/bash
# export-sim-to-supabase.sh
# Exports sim data from local PostgreSQL to Supabase sim_* tables.
# Only exports the 3 tables the trader app needs:
#   - ohlcv_prices → sim_ohlcv_prices (all goods + forex × 3 currencies)
#   - balance_sheets → sim_balance_sheets (filtered: CreditBank + National only)
#   - config_changes → sim_config_changes (autopilot policy decisions)
#
# Usage:
#   SUPABASE_DB=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres \
#   bash scripts/export-sim-to-supabase.sh
#
# Optional env vars:
#   LOCAL_PG          — local PostgreSQL connection (default: postgresql://localhost:5432/compecon)
#   MAX_DATE          — cap the date range (e.g., "2011-01-01" for first 10 years)
#   SAMPLE_EVERY_N    — keep every Nth day (e.g., 2 = every other day). Default: 1 (all days)
#   PSQL_PATH         — path to psql binary (default: psql)
#
# Requires: psql (PostgreSQL CLI tools)
# Works on: Linux, macOS, WSL, Git Bash (Windows)

set -euo pipefail

LOCAL_PG="${LOCAL_PG:-postgresql://localhost:5432/compecon}"
SUPABASE_DB="${SUPABASE_DB:?ERROR: Set SUPABASE_DB to your Supabase direct connection string (port 5432, not pooler 6543)}"
MAX_DATE="${MAX_DATE:-}"
SAMPLE_EVERY_N="${SAMPLE_EVERY_N:-1}"
PSQL="${PSQL_PATH:-psql}"

echo "=== Sim → Supabase Export ==="
echo "    Source: ${LOCAL_PG}"
echo "    Target: $(echo "$SUPABASE_DB" | sed 's/:\/\/[^@]*@/:\/\/***@/')"
echo "    Max date: ${MAX_DATE:-all}"
echo "    Sample: every ${SAMPLE_EVERY_N} day(s)"
echo ""

# ── Helper: build WHERE clause for date filtering + thinning ──────
# Uses ROW_NUMBER() window to thin by every Nth date
build_date_filter() {
  local date_col="$1"
  local conditions=""

  if [ -n "$MAX_DATE" ]; then
    conditions="${date_col} <= '${MAX_DATE}'"
  fi

  echo "$conditions"
}

# ── Step 1: Truncate target tables ────────────────────────────────
echo "--- Truncating target tables in Supabase ---"
for table in sim_ohlcv_prices sim_balance_sheets sim_config_changes; do
  "$PSQL" "$SUPABASE_DB" -q -c "TRUNCATE TABLE ${table} CASCADE;" 2>/dev/null || \
    echo "    WARN: Could not truncate ${table} (run the migration first)"
done
echo ""

TOTAL_ROWS=0

# ── Step 2: Export ohlcv_prices ───────────────────────────────────
echo -n "  ohlcv_prices → sim_ohlcv_prices ... "

DATE_FILTER=$(build_date_filter "sim_date")
OHLCV_WHERE=""
if [ -n "$DATE_FILTER" ]; then
  OHLCV_WHERE="WHERE ${DATE_FILTER}"
fi

if [ "$SAMPLE_EVERY_N" -gt 1 ]; then
  # Thin by keeping every Nth distinct date
  OHLCV_QUERY="COPY (
    WITH numbered AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY sim_date) as rn
      FROM (SELECT DISTINCT sim_date FROM ohlcv_prices ${OHLCV_WHERE}) dates
    ),
    keep_dates AS (
      SELECT sim_date FROM numbered WHERE (rn - 1) % ${SAMPLE_EVERY_N} = 0
    )
    SELECT o.sim_date, o.currency, o.asset_type, o.asset_name,
           o.open_price, o.high_price, o.low_price, o.close_price, o.volume
    FROM ohlcv_prices o
    INNER JOIN keep_dates k ON o.sim_date = k.sim_date
    ORDER BY o.sim_date
  ) TO STDOUT"
else
  OHLCV_QUERY="COPY (
    SELECT sim_date, currency, asset_type, asset_name,
           open_price, high_price, low_price, close_price, volume
    FROM ohlcv_prices
    ${OHLCV_WHERE}
    ORDER BY sim_date
  ) TO STDOUT"
fi

"$PSQL" "$LOCAL_PG" -c "$OHLCV_QUERY" | \
  "$PSQL" "$SUPABASE_DB" -c "COPY sim_ohlcv_prices(sim_date, currency, asset_type, asset_name, open_price, high_price, low_price, close_price, volume) FROM STDIN"

COUNT=$("$PSQL" "$SUPABASE_DB" -t -c "SELECT COUNT(*) FROM sim_ohlcv_prices;" | tr -d ' \r\n')
TOTAL_ROWS=$((TOTAL_ROWS + COUNT))
echo "${COUNT} rows"

# ── Step 3: Export balance_sheets (filtered to CreditBank + National) ──
echo -n "  balance_sheets → sim_balance_sheets (CreditBank + National) ... "

BS_WHERE="WHERE agent_type IN ('CreditBank', 'National')"
if [ -n "$DATE_FILTER" ]; then
  BS_WHERE="${BS_WHERE} AND ${DATE_FILTER}"
fi

BS_COLS="sim_date, currency, agent_type, hard_cash, cash_giro_short, cash_giro_long, bonds, bank_loans, inventory_value, loans_giro_short, loans_giro_long, financial_liabilities, bank_borrowings, equity"

if [ "$SAMPLE_EVERY_N" -gt 1 ]; then
  BS_QUERY="COPY (
    WITH numbered AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY sim_date) as rn
      FROM (SELECT DISTINCT sim_date FROM balance_sheets ${BS_WHERE}) dates
    ),
    keep_dates AS (
      SELECT sim_date FROM numbered WHERE (rn - 1) % ${SAMPLE_EVERY_N} = 0
    )
    SELECT b.sim_date, b.currency, b.agent_type,
           b.hard_cash, b.cash_giro_short, b.cash_giro_long,
           b.bonds, b.bank_loans, b.inventory_value,
           b.loans_giro_short, b.loans_giro_long,
           b.financial_liabilities, b.bank_borrowings, b.equity
    FROM balance_sheets b
    INNER JOIN keep_dates k ON b.sim_date = k.sim_date
    WHERE b.agent_type IN ('CreditBank', 'National')
    ORDER BY b.sim_date
  ) TO STDOUT"
else
  BS_QUERY="COPY (
    SELECT ${BS_COLS}
    FROM balance_sheets
    ${BS_WHERE}
    ORDER BY sim_date
  ) TO STDOUT"
fi

"$PSQL" "$LOCAL_PG" -c "$BS_QUERY" | \
  "$PSQL" "$SUPABASE_DB" -c "COPY sim_balance_sheets(${BS_COLS}) FROM STDIN"

COUNT=$("$PSQL" "$SUPABASE_DB" -t -c "SELECT COUNT(*) FROM sim_balance_sheets;" | tr -d ' \r\n')
TOTAL_ROWS=$((TOTAL_ROWS + COUNT))
echo "${COUNT} rows"

# ── Step 4: Export config_changes (always full — small table) ─────
echo -n "  config_changes → sim_config_changes ... "

CC_WHERE=""
if [ -n "$MAX_DATE" ]; then
  CC_WHERE="WHERE sim_date <= '${MAX_DATE}'"
fi

CC_QUERY="COPY (
  SELECT sim_date, changed_at, setting_key, old_value, new_value,
         rule_id, rule_title, intensity, explanation
  FROM config_changes
  ${CC_WHERE}
  ORDER BY sim_date, id
) TO STDOUT"

"$PSQL" "$LOCAL_PG" -c "$CC_QUERY" | \
  "$PSQL" "$SUPABASE_DB" -c "COPY sim_config_changes(sim_date, changed_at, setting_key, old_value, new_value, rule_id, rule_title, intensity, explanation) FROM STDIN"

COUNT=$("$PSQL" "$SUPABASE_DB" -t -c "SELECT COUNT(*) FROM sim_config_changes;" | tr -d ' \r\n')
TOTAL_ROWS=$((TOTAL_ROWS + COUNT))
echo "${COUNT} rows"

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "=== Done! Total rows exported: ${TOTAL_ROWS} ==="
echo ""

# Spot check
echo "Spot-check (first 5 dates):"
"$PSQL" "$SUPABASE_DB" -c "SELECT sim_date, COUNT(*) FROM sim_ohlcv_prices GROUP BY sim_date ORDER BY sim_date LIMIT 5;"

echo ""
echo "Date range:"
"$PSQL" "$SUPABASE_DB" -c "SELECT MIN(sim_date) as first_date, MAX(sim_date) as last_date, COUNT(DISTINCT sim_date) as total_days FROM sim_ohlcv_prices;"
