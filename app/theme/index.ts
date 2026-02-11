export const colors = {
  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceLight: '#252542',
  surfaceHighlight: '#2d2d50',
  primary: '#00d4aa',
  primaryDim: '#00a88a',
  accent: '#6c63ff',
  success: '#4CAF50',
  error: '#f44336',
  warning: '#FFB74D',
  text: '#e0e0e0',
  textDim: '#888',
  textMuted: '#555',
  border: '#2a2a45',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  // Currency-specific accents
  eur: '#4FC3F7',
  usd: '#66BB6A',
  yen: '#FFB74D',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 28,
  hero: 36,
} as const;

export const currencyColor = (currency: string): string => {
  switch (currency) {
    case 'EUR': return colors.eur;
    case 'USD': return colors.usd;
    case 'YEN': return colors.yen;
    default: return colors.text;
  }
};
