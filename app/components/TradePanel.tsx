/**
 * TradePanel — Buy/Sell controls at the bottom of the instrument detail screen.
 * Shows current price, quantity input, total cost, and execute button.
 */
import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons } from 'react-native-paper';
import { colors, spacing, fontSize } from '../theme';
import { formatPrice, formatCurrency, getCurrencySymbol } from '../lib/format';
import { useStore } from '../lib/store';
import { gameSocket } from '../lib/socket';

interface TradePanelProps {
  instrumentId: string;
  instrumentName: string;
  currentPrice: number;
  currency: string;
}

export default function TradePanel({
  instrumentId,
  instrumentName,
  currentPrice,
  currency,
}: TradePanelProps) {
  const { portfolio, selectedAccountId } = useStore();
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Find the account for this currency
  const account = useMemo(() => {
    if (!portfolio) return null;
    return portfolio.accounts.find(a => a.currency === currency);
  }, [portfolio, currency]);

  // Find current holding of this instrument
  const holding = useMemo(() => {
    if (!account) return null;
    return account.holdings.find(h => h.instrumentId === instrumentId);
  }, [account, instrumentId]);

  const qty = parseFloat(quantity) || 0;
  const totalCost = qty * currentPrice;
  const canAfford = account ? totalCost <= account.cashBalance : false;
  const canSell = holding ? qty <= holding.quantity : false;

  async function executeTrade() {
    if (!account || qty <= 0) return;

    setLoading(true);
    setResult(null);

    // Listen for result
    const onSuccess = (data: any) => {
      setResult({ success: true, message: `${tradeType === 'buy' ? 'Bought' : 'Sold'} ${qty} units at ${formatPrice(data.price, currency)}` });
      setQuantity('');
      setLoading(false);
    };
    const onError = (data: any) => {
      setResult({ success: false, message: data.error || 'Trade failed' });
      setLoading(false);
    };

    const unsubSuccess = gameSocket.on('trade_success', onSuccess);
    const unsubError = gameSocket.on('trade_error', onError);

    // Send trade
    gameSocket.send(tradeType, {
      accountId: account.id,
      instrumentId,
      quantity: qty,
      currency,
    });

    // Timeout fallback
    setTimeout(() => {
      unsubSuccess();
      unsubError();
      if (loading) {
        setResult({ success: false, message: 'Trade timed out' });
        setLoading(false);
      }
    }, 10000);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trade {instrumentName}</Text>
        <Text style={styles.price}>{formatPrice(currentPrice, currency)}</Text>
      </View>

      {!account ? (
        <View style={styles.noAccount}>
          <Text style={styles.noAccountText}>
            You need a {currency} account to trade this instrument.
          </Text>
          <Text style={styles.noAccountHint}>
            Go to Accounts tab to create one.
          </Text>
        </View>
      ) : (
        <>
          {/* Buy/Sell toggle */}
          <SegmentedButtons
            value={tradeType}
            onValueChange={(v) => setTradeType(v as 'buy' | 'sell')}
            buttons={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
            style={styles.toggle}
            theme={{
              colors: {
                secondaryContainer: tradeType === 'buy' ? colors.success : colors.error,
                onSecondaryContainer: '#fff',
                onSurface: colors.textDim,
              },
            }}
          />

          {/* Quantity input */}
          <TextInput
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            mode="outlined"
            keyboardType="numeric"
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            style={styles.input}
            theme={{ colors: { onSurfaceVariant: colors.textDim } }}
          />

          {/* Summary */}
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {tradeType === 'buy' ? 'Total Cost' : 'Total Proceeds'}
              </Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(totalCost, currency)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cash Available</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(account.cashBalance, currency)}
              </Text>
            </View>
            {holding && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Current Holdings</Text>
                <Text style={styles.summaryValue}>{holding.quantity} units</Text>
              </View>
            )}
          </View>

          {/* Result message */}
          {result && (
            <Text style={[styles.result, { color: result.success ? colors.success : colors.error }]}>
              {result.message}
            </Text>
          )}

          {/* Execute button */}
          <Button
            mode="contained"
            onPress={executeTrade}
            loading={loading}
            disabled={
              loading || qty <= 0 ||
              (tradeType === 'buy' && !canAfford) ||
              (tradeType === 'sell' && !canSell)
            }
            style={styles.executeButton}
            buttonColor={tradeType === 'buy' ? colors.success : colors.error}
            textColor="#fff"
            labelStyle={styles.executeLabel}
          >
            {tradeType === 'buy'
              ? qty > 0 && !canAfford
                ? 'Insufficient Funds'
                : `Buy ${qty > 0 ? qty : ''} ${instrumentName}`
              : qty > 0 && !canSell
                ? 'Insufficient Holdings'
                : `Sell ${qty > 0 ? qty : ''} ${instrumentName}`}
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  toggle: {
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.md,
  },
  summary: {
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  summaryLabel: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  summaryValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  result: {
    textAlign: 'center',
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  executeButton: {
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
  executeLabel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  noAccount: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  noAccountText: {
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  noAccountHint: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});
