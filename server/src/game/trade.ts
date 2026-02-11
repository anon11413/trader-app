/**
 * Trade execution — validates and executes buy/sell via Supabase RPC.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { getInstrumentPrice, Currency } from '../sim/instruments';

export interface TradeRequest {
  accountId: string;
  instrumentId: string;
  tradeType: 'buy' | 'sell';
  quantity: number;
  currency: Currency;
}

export interface TradeResult {
  success: boolean;
  error?: string;
  tradeType?: string;
  instrument?: string;
  quantity?: number;
  price?: number;
  totalCost?: number;
  newCash?: number;
}

export async function executeTrade(
  userClient: SupabaseClient,
  req: TradeRequest
): Promise<TradeResult> {
  // Validate quantity
  if (!req.quantity || req.quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }

  // Get current price from simulation
  const priceData = await getInstrumentPrice(req.instrumentId, req.currency);
  if (!priceData || priceData.price <= 0) {
    return { success: false, error: 'Could not determine current price' };
  }

  // Execute trade via RPC
  const { data, error } = await userClient.rpc('execute_trade', {
    p_account_id: req.accountId,
    p_instrument_id: req.instrumentId,
    p_trade_type: req.tradeType,
    p_quantity: req.quantity,
    p_price: priceData.price,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as any;
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    tradeType: req.tradeType,
    instrument: req.instrumentId,
    quantity: req.quantity,
    price: priceData.price,
    totalCost: result.total_cost,
    newCash: result.new_cash,
  };
}
