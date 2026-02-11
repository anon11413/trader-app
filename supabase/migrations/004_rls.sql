-- Trader App: Row-Level Security Policies

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;

-- Players: public read (for leaderboard/display), own write
CREATE POLICY "Public player profiles" ON players FOR SELECT USING (true);
CREATE POLICY "Own profile update" ON players FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Own player insert" ON players FOR INSERT WITH CHECK (auth.uid() = id);

-- Accounts: own only
CREATE POLICY "Own accounts select" ON player_accounts FOR SELECT USING (player_id = auth.uid());
CREATE POLICY "Own accounts update" ON player_accounts FOR UPDATE USING (player_id = auth.uid());
CREATE POLICY "Own accounts insert" ON player_accounts FOR INSERT WITH CHECK (player_id = auth.uid());

-- Holdings: own only (via account ownership)
CREATE POLICY "Own holdings select" ON holdings FOR SELECT
  USING (account_id IN (SELECT id FROM player_accounts WHERE player_id = auth.uid()));

-- Trades: own only
CREATE POLICY "Own trades select" ON trades FOR SELECT USING (player_id = auth.uid());

-- Conversions: own only
CREATE POLICY "Own conversions select" ON currency_conversions FOR SELECT USING (player_id = auth.uid());

-- Price snapshots: publicly readable (server writes via service_role)
CREATE POLICY "Public price snapshots" ON price_snapshots FOR SELECT USING (true);

-- Leaderboard cache: publicly readable (server writes via service_role)
CREATE POLICY "Public leaderboard" ON leaderboard_cache FOR SELECT USING (true);

-- Grant RPC permissions
GRANT EXECUTE ON FUNCTION register_player(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_username_available(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_trade(UUID, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_currency(UUID, UUID, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_portfolio_summary() TO authenticated;
GRANT SELECT ON leaderboard_by_total_cash TO anon, authenticated;
