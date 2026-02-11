/**
 * Portfolio valuation — compute total value of a player's portfolio
 * using current instrument prices from the simulation.
 */
import { supabaseAdmin } from '../db/supabase';
import { getInstrumentPrice, Currency, CURRENCIES } from '../sim/instruments';

export interface PortfolioAccount {
  id: string;
  currency: string;
  cashBalance: number;
  holdings: {
    instrumentId: string;
    quantity: number;
    avgCostBasis: number;
    currentPrice: number;
    currentValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
  }[];
  totalValue: number;
}

export interface PortfolioSummary {
  accounts: PortfolioAccount[];
  totalValueEUR: number; // everything converted to EUR
}

/**
 * Get full portfolio with live valuations for a player.
 */
export async function getPortfolioWithPrices(playerId: string): Promise<PortfolioSummary> {
  // Fetch accounts + holdings
  const { data: accounts, error } = await supabaseAdmin
    .from('player_accounts')
    .select(`
      id, currency, cash_balance,
      holdings (instrument_id, quantity, avg_cost_basis)
    `)
    .eq('player_id', playerId)
    .order('currency');

  if (error || !accounts) {
    return { accounts: [], totalValueEUR: 0 };
  }

  const result: PortfolioAccount[] = [];

  for (const acct of accounts) {
    const currency = acct.currency as Currency;
    const holdingsWithPrices = [];

    for (const h of (acct.holdings || [])) {
      const priceData = await getInstrumentPrice(h.instrument_id, currency);
      const currentPrice = priceData?.price ?? 0;
      const currentValue = h.quantity * currentPrice;
      const costBasis = h.quantity * h.avg_cost_basis;
      const unrealizedPL = currentValue - costBasis;
      const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;

      holdingsWithPrices.push({
        instrumentId: h.instrument_id,
        quantity: h.quantity,
        avgCostBasis: h.avg_cost_basis,
        currentPrice,
        currentValue,
        unrealizedPL,
        unrealizedPLPercent,
      });
    }

    const holdingsValue = holdingsWithPrices.reduce((sum, h) => sum + h.currentValue, 0);

    result.push({
      id: acct.id,
      currency: acct.currency,
      cashBalance: acct.cash_balance,
      holdings: holdingsWithPrices,
      totalValue: acct.cash_balance + holdingsValue,
    });
  }

  // TODO: Convert all to EUR for total comparison (using exchange rates)
  const totalValueEUR = result.reduce((sum, a) => sum + a.totalValue, 0);

  return { accounts: result, totalValueEUR };
}
