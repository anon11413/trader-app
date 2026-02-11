/**
 * Number and currency formatting utilities.
 */

/**
 * Format a number as currency with symbol.
 */
export function formatCurrency(value: number, currency: string = 'EUR', decimals: number = 2): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    YEN: '¥',
  };
  const symbol = symbols[currency] ?? currency;
  const formatted = formatNumber(Math.abs(value), decimals);
  return value < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

/**
 * Format a number with commas and decimal places.
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (isNaN(value) || !isFinite(value)) return '0.00';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a compact number (e.g., 1.2K, 3.5M).
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(2);
}

/**
 * Format a percentage change with + or - prefix.
 */
export function formatChange(value: number, decimals: number = 2): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}%`;
}

/**
 * Format a price — uses more decimal places for small values.
 */
export function formatPrice(value: number, currency: string = 'EUR'): string {
  if (value === 0) return formatCurrency(0, currency, 2);
  const decimals = Math.abs(value) < 1 ? 4 : Math.abs(value) < 100 ? 2 : 2;
  return formatCurrency(value, currency, decimals);
}

/**
 * Format P/L value with color hint.
 */
export function formatPL(value: number, currency: string = 'EUR'): { text: string; isPositive: boolean } {
  const prefix = value >= 0 ? '+' : '';
  return {
    text: `${prefix}${formatCurrency(value, currency)}`,
    isPositive: value >= 0,
  };
}

/**
 * Format a relative time (e.g., "2m ago", "1h ago").
 */
export function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Currency symbol lookup.
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = { EUR: '€', USD: '$', YEN: '¥' };
  return symbols[currency] ?? currency;
}
