-- Trader App: Initial Schema
-- Tables: players, player_accounts, holdings, trades, currency_conversions, price_snapshots

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table (linked to Supabase Auth)
CREATE TABLE players (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  last_trade_at TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$')
);

-- Player accounts — one per currency (EUR, USD, YEN)
CREATE TABLE player_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('EUR', 'USD', 'YEN')),
  cash_balance NUMERIC(20,4) DEFAULT 0 CHECK (cash_balance >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_account_per_currency UNIQUE (player_id, currency)
);

-- Holdings — what instruments a player owns in each account
CREATE TABLE holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL,
  quantity NUMERIC(20,8) DEFAULT 0 CHECK (quantity >= 0),
  avg_cost_basis NUMERIC(20,8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_holding_per_instrument UNIQUE (account_id, instrument_id)
);

-- Trade history
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  quantity NUMERIC(20,8) NOT NULL,
  price_at_trade NUMERIC(20,8) NOT NULL,
  total_cost NUMERIC(20,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Currency conversions between player accounts
CREATE TABLE currency_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL REFERENCES player_accounts(id),
  to_account_id UUID NOT NULL REFERENCES player_accounts(id),
  amount_from NUMERIC(20,4) NOT NULL,
  amount_to NUMERIC(20,4) NOT NULL,
  exchange_rate NUMERIC(20,8) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price snapshots — server writes current prices every 60 seconds
CREATE TABLE price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard cache — server-computed rankings
CREATE TABLE leaderboard_cache (
  id SERIAL PRIMARY KEY,
  leaderboard_type TEXT NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  rank INT NOT NULL,
  value NUMERIC(20,4) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_lb_entry UNIQUE (leaderboard_type, player_id)
);

-- Indexes
CREATE INDEX idx_players_username ON players(LOWER(username));
CREATE INDEX idx_player_accounts_player ON player_accounts(player_id);
CREATE INDEX idx_holdings_account ON holdings(account_id);
CREATE INDEX idx_trades_player ON trades(player_id);
CREATE INDEX idx_trades_created ON trades(created_at DESC);
CREATE INDEX idx_conversions_player ON currency_conversions(player_id);
CREATE INDEX idx_price_snapshots_lookup ON price_snapshots(instrument_id, currency, recorded_at DESC);
CREATE INDEX idx_lb_cache_type_rank ON leaderboard_cache(leaderboard_type, rank);
