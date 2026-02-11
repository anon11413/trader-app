/**
 * Account management — create currency accounts, convert between currencies.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../db/supabase';
import { getExchangeRate, Currency, CURRENCIES } from '../sim/instruments';

export interface CreateAccountResult {
  success: boolean;
  error?: string;
  accountId?: string;
  currency?: string;
}

export async function createAccount(
  userId: string, currency: Currency
): Promise<CreateAccountResult> {
  if (!CURRENCIES.includes(currency)) {
    return { success: false, error: `Invalid currency: ${currency}` };
  }

  // Check if account already exists
  const { data: existing } = await supabaseAdmin
    .from('player_accounts')
    .select('id')
    .eq('player_id', userId)
    .eq('currency', currency)
    .single();

  if (existing) {
    return { success: false, error: `You already have a ${currency} account` };
  }

  // Create account with 0 balance
  const { data, error } = await supabaseAdmin
    .from('player_accounts')
    .insert({ player_id: userId, currency, cash_balance: 0 })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, accountId: data.id, currency };
}

export interface ConvertResult {
  success: boolean;
  error?: string;
  amountFrom?: number;
  amountTo?: number;
  exchangeRate?: number;
  fromCurrency?: string;
  toCurrency?: string;
}

export async function convertCurrency(
  userClient: SupabaseClient,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<ConvertResult> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }

  if (fromCurrency === toCurrency) {
    return { success: false, error: 'Cannot convert to same currency' };
  }

  // Get live exchange rate from simulation
  const rate = await getExchangeRate(fromCurrency, toCurrency);

  // Execute via RPC
  const { data, error } = await userClient.rpc('convert_currency', {
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_amount: amount,
    p_exchange_rate: rate,
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
    amountFrom: amount,
    amountTo: result.amount_to,
    exchangeRate: rate,
    fromCurrency,
    toCurrency,
  };
}

/**
 * Bootstrap default accounts for a player if missing (idempotent).
 */
export async function bootstrapAccounts(userId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('player_accounts')
    .select('currency')
    .eq('player_id', userId);

  if (!existing || existing.length === 0) {
    // Create default EUR account with $100
    await supabaseAdmin
      .from('player_accounts')
      .insert({ player_id: userId, currency: 'EUR', cash_balance: 100 });
  }
}
