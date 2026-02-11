-- Trader App: Leaderboard Views
-- Materialized view for quick cash-based leaderboard
-- Server-computed leaderboard_cache handles portfolio value (needs live prices)

CREATE MATERIALIZED VIEW leaderboard_by_total_cash AS
SELECT
  p.id AS player_id,
  p.username,
  p.display_name,
  COALESCE(SUM(pa.cash_balance), 0) AS total_cash,
  ROW_NUMBER() OVER (
    ORDER BY COALESCE(SUM(pa.cash_balance), 0) DESC, p.created_at ASC
  ) AS rank
FROM players p
LEFT JOIN player_accounts pa ON pa.player_id = p.id
GROUP BY p.id, p.username, p.display_name, p.created_at
ORDER BY total_cash DESC
LIMIT 100;

CREATE UNIQUE INDEX idx_lb_cash_player ON leaderboard_by_total_cash(player_id);

-- Refresh function (called by server cron)
CREATE OR REPLACE FUNCTION refresh_leaderboards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_by_total_cash;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_leaderboards() TO service_role;
