-- Trader App: Game RPC Functions
-- register_player, check_username_available, execute_trade, convert_currency, get_portfolio_summary

-- Register player (atomic username check + insert)
CREATE OR REPLACE FUNCTION register_player(
  p_user_id UUID,
  p_username TEXT,
  p_display_name TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing UUID;
BEGIN
  SELECT id INTO v_existing FROM players
  WHERE LOWER(username) = LOWER(p_username);

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is already taken');
  END IF;

  INSERT INTO players (id, username, display_name)
  VALUES (p_user_id, p_username, COALESCE(p_display_name, p_username));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Check username availability
CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF char_length(p_username) < 3 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'Too short (min 3 characters)');
  END IF;
  IF char_length(p_username) > 20 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'Too long (max 20 characters)');
  END IF;
  IF NOT (p_username ~ '^[a-zA-Z0-9_]+$') THEN
    RETURN jsonb_build_object('available', false, 'reason', 'Only letters, numbers, and underscores');
  END IF;

  IF EXISTS (SELECT 1 FROM players WHERE LOWER(username) = LOWER(p_username)) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'Already taken');
  END IF;

  RETURN jsonb_build_object('available', true);
END;
$$;

-- Auto-create EUR account with $100 on player registration
CREATE OR REPLACE FUNCTION handle_new_player()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO player_accounts (player_id, currency, cash_balance)
  VALUES (NEW.id, 'EUR', 100.0000);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_player_created
  AFTER INSERT ON players
  FOR EACH ROW EXECUTE FUNCTION handle_new_player();

-- Execute trade (buy or sell)
CREATE OR REPLACE FUNCTION execute_trade(
  p_account_id UUID,
  p_instrument_id TEXT,
  p_trade_type TEXT,
  p_quantity NUMERIC,
  p_price NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_cash NUMERIC;
  v_total_cost NUMERIC;
  v_last_trade TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_current_qty NUMERIC;
  v_current_basis NUMERIC;
  v_new_qty NUMERIC;
  v_new_basis NUMERIC;
BEGIN
  -- Verify ownership and lock row
  SELECT pa.player_id, pa.cash_balance, p.last_trade_at
  INTO v_player_id, v_cash, v_last_trade
  FROM player_accounts pa
  JOIN players p ON p.id = pa.player_id
  WHERE pa.id = p_account_id AND pa.player_id = auth.uid()
  FOR UPDATE;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found or unauthorized');
  END IF;

  -- Rate limit: 2-second cooldown
  IF v_last_trade IS NOT NULL AND v_last_trade > v_now - INTERVAL '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please wait before trading again');
  END IF;

  v_total_cost := p_quantity * p_price;

  IF p_trade_type = 'buy' THEN
    IF v_cash < v_total_cost THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds',
        'available', v_cash, 'required', v_total_cost);
    END IF;

    -- Deduct cash
    UPDATE player_accounts SET cash_balance = cash_balance - v_total_cost
    WHERE id = p_account_id;

    -- Upsert holding with weighted average cost basis
    SELECT quantity, avg_cost_basis INTO v_current_qty, v_current_basis
    FROM holdings WHERE account_id = p_account_id AND instrument_id = p_instrument_id;

    IF v_current_qty IS NULL THEN
      INSERT INTO holdings (account_id, instrument_id, quantity, avg_cost_basis)
      VALUES (p_account_id, p_instrument_id, p_quantity, p_price);
    ELSE
      v_new_qty := v_current_qty + p_quantity;
      v_new_basis := ((v_current_qty * v_current_basis) + (p_quantity * p_price)) / v_new_qty;
      UPDATE holdings SET quantity = v_new_qty, avg_cost_basis = v_new_basis
      WHERE account_id = p_account_id AND instrument_id = p_instrument_id;
    END IF;

  ELSIF p_trade_type = 'sell' THEN
    SELECT quantity, avg_cost_basis INTO v_current_qty, v_current_basis
    FROM holdings WHERE account_id = p_account_id AND instrument_id = p_instrument_id;

    IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient holdings',
        'available', COALESCE(v_current_qty, 0));
    END IF;

    -- Add cash from sale
    UPDATE player_accounts SET cash_balance = cash_balance + v_total_cost
    WHERE id = p_account_id;

    -- Reduce or remove holdings
    v_new_qty := v_current_qty - p_quantity;
    IF v_new_qty < 0.00000001 THEN
      DELETE FROM holdings WHERE account_id = p_account_id AND instrument_id = p_instrument_id;
    ELSE
      UPDATE holdings SET quantity = v_new_qty
      WHERE account_id = p_account_id AND instrument_id = p_instrument_id;
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid trade type');
  END IF;

  -- Record trade
  INSERT INTO trades (player_id, account_id, instrument_id, trade_type, quantity, price_at_trade, total_cost)
  VALUES (v_player_id, p_account_id, p_instrument_id, p_trade_type, p_quantity, p_price, v_total_cost);

  -- Update rate limit + activity
  UPDATE players SET last_trade_at = v_now, last_active_at = v_now WHERE id = v_player_id;

  RETURN jsonb_build_object(
    'success', true,
    'trade_type', p_trade_type,
    'instrument', p_instrument_id,
    'quantity', p_quantity,
    'price', p_price,
    'total_cost', v_total_cost,
    'new_cash', (SELECT cash_balance FROM player_accounts WHERE id = p_account_id)
  );
END;
$$;

-- Convert currency between accounts
CREATE OR REPLACE FUNCTION convert_currency(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_exchange_rate NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_from_cash NUMERIC;
  v_from_currency TEXT;
  v_to_currency TEXT;
  v_converted NUMERIC;
BEGIN
  -- Verify source account belongs to caller
  SELECT player_id, cash_balance, currency
  INTO v_player_id, v_from_cash, v_from_currency
  FROM player_accounts WHERE id = p_from_account_id AND player_id = auth.uid()
  FOR UPDATE;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source account not found');
  END IF;

  -- Verify target account belongs to caller
  SELECT currency INTO v_to_currency
  FROM player_accounts WHERE id = p_to_account_id AND player_id = auth.uid();

  IF v_to_currency IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target account not found');
  END IF;

  IF v_from_currency = v_to_currency THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot convert to same currency');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF v_from_cash < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds',
      'available', v_from_cash);
  END IF;

  v_converted := p_amount * p_exchange_rate;

  -- Execute conversion
  UPDATE player_accounts SET cash_balance = cash_balance - p_amount WHERE id = p_from_account_id;
  UPDATE player_accounts SET cash_balance = cash_balance + v_converted WHERE id = p_to_account_id;

  -- Record conversion
  INSERT INTO currency_conversions (player_id, from_account_id, to_account_id, amount_from, amount_to, exchange_rate)
  VALUES (v_player_id, p_from_account_id, p_to_account_id, p_amount, v_converted, p_exchange_rate);

  RETURN jsonb_build_object(
    'success', true,
    'from_currency', v_from_currency,
    'to_currency', v_to_currency,
    'amount_from', p_amount,
    'amount_to', v_converted,
    'exchange_rate', p_exchange_rate
  );
END;
$$;

-- Get portfolio summary for current user
CREATE OR REPLACE FUNCTION get_portfolio_summary()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'accounts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'currency', pa.currency,
        'cash_balance', pa.cash_balance,
        'holdings', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'instrument_id', h.instrument_id,
            'quantity', h.quantity,
            'avg_cost_basis', h.avg_cost_basis
          )), '[]'::jsonb)
          FROM holdings h WHERE h.account_id = pa.id
        )
      ) ORDER BY pa.currency), '[]'::jsonb)
      FROM player_accounts pa WHERE pa.player_id = auth.uid()
    ),
    'recent_trades', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'instrument_id', t.instrument_id,
        'trade_type', t.trade_type,
        'quantity', t.quantity,
        'price_at_trade', t.price_at_trade,
        'total_cost', t.total_cost,
        'created_at', t.created_at
      ) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM trades WHERE player_id = auth.uid()
        ORDER BY created_at DESC LIMIT 20
      ) t
    ),
    'recent_conversions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'amount_from', c.amount_from,
        'amount_to', c.amount_to,
        'exchange_rate', c.exchange_rate,
        'created_at', c.created_at
      ) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM currency_conversions WHERE player_id = auth.uid()
        ORDER BY created_at DESC LIMIT 10
      ) c
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
