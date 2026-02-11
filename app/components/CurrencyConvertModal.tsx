/**
 * CurrencyConvertModal — modal for converting funds between currency accounts.
 * Shows live exchange rate and computed receive amount.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { colors, spacing, fontSize, currencyColor } from '../theme';
import { formatCurrency, getCurrencySymbol } from '../lib/format';
import { useStore } from '../lib/store';
import { gameSocket } from '../lib/socket';
import * as simApi from '../lib/simApi';

interface CurrencyConvertModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function CurrencyConvertModal({ visible, onDismiss }: CurrencyConvertModalProps) {
  const { portfolio } = useStore();
  const accounts = portfolio?.accounts || [];

  const [fromCurrency, setFromCurrency] = useState('EUR');
  const [toCurrency, setToCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch exchange rate
  useEffect(() => {
    if (!visible || fromCurrency === toCurrency) {
      setRate(null);
      return;
    }
    let cancelled = false;
    simApi.getExchangeRate(fromCurrency, toCurrency)
      .then((data) => {
        if (!cancelled) setRate(data.rate);
      })
      .catch(() => {
        if (!cancelled) setRate(null);
      });
    return () => { cancelled = true; };
  }, [visible, fromCurrency, toCurrency]);

  const fromAccount = accounts.find(a => a.currency === fromCurrency);
  const toAccount = accounts.find(a => a.currency === toCurrency);
  const amountNum = parseFloat(amount) || 0;
  const receiveAmount = rate ? amountNum * rate : 0;
  const canConvert = fromAccount && toAccount && amountNum > 0 && amountNum <= (fromAccount.cashBalance) && rate !== null;

  // Available currencies for "to"
  const availableCurrencies = accounts.map(a => a.currency);

  function handleConvert() {
    if (!fromAccount || !toAccount || !canConvert) return;
    setLoading(true);
    setResult(null);

    const onSuccess = (data: any) => {
      setResult({
        success: true,
        message: `Converted ${formatCurrency(amountNum, fromCurrency)} to ${formatCurrency(data.amountTo || receiveAmount, toCurrency)}`,
      });
      setAmount('');
      setLoading(false);
    };
    const onError = (data: any) => {
      setResult({ success: false, message: data.error || 'Conversion failed' });
      setLoading(false);
    };

    const unsubSuccess = gameSocket.on('convert_success', onSuccess);
    const unsubError = gameSocket.on('convert_error', onError);

    gameSocket.send('convert_currency', {
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      amount: amountNum,
      fromCurrency,
      toCurrency,
    });

    setTimeout(() => {
      unsubSuccess();
      unsubError();
    }, 10000);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Convert Currency</Text>

          {/* From currency */}
          <Text style={styles.label}>From</Text>
          <View style={styles.currencyPicker}>
            {availableCurrencies.map((cur) => (
              <Pressable
                key={cur}
                style={[
                  styles.currencyChip,
                  fromCurrency === cur && { backgroundColor: currencyColor(cur) + '30', borderColor: currencyColor(cur) },
                ]}
                onPress={() => {
                  setFromCurrency(cur);
                  if (cur === toCurrency) {
                    const other = availableCurrencies.find(c => c !== cur);
                    if (other) setToCurrency(other);
                  }
                }}
              >
                <Text style={[
                  styles.currencyChipText,
                  fromCurrency === cur && { color: currencyColor(cur) },
                ]}>
                  {cur}
                </Text>
              </Pressable>
            ))}
          </View>
          {fromAccount && (
            <Text style={styles.balanceText}>
              Balance: {formatCurrency(fromAccount.cashBalance, fromCurrency)}
            </Text>
          )}

          {/* Amount input */}
          <TextInput
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            mode="outlined"
            keyboardType="numeric"
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            style={styles.input}
            theme={{ colors: { onSurfaceVariant: colors.textDim } }}
            left={<TextInput.Affix text={getCurrencySymbol(fromCurrency)} textStyle={{ color: colors.textDim }} />}
          />

          {/* To currency */}
          <Text style={styles.label}>To</Text>
          <View style={styles.currencyPicker}>
            {availableCurrencies
              .filter(c => c !== fromCurrency)
              .map((cur) => (
                <Pressable
                  key={cur}
                  style={[
                    styles.currencyChip,
                    toCurrency === cur && { backgroundColor: currencyColor(cur) + '30', borderColor: currencyColor(cur) },
                  ]}
                  onPress={() => setToCurrency(cur)}
                >
                  <Text style={[
                    styles.currencyChipText,
                    toCurrency === cur && { color: currencyColor(cur) },
                  ]}>
                    {cur}
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* Exchange rate + receive amount */}
          {rate !== null && (
            <View style={styles.rateBox}>
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>Exchange Rate</Text>
                <Text style={styles.rateValue}>
                  1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}
                </Text>
              </View>
              {amountNum > 0 && (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>You'll Receive</Text>
                  <Text style={[styles.rateValue, { color: colors.primary, fontWeight: '700' }]}>
                    {formatCurrency(receiveAmount, toCurrency)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Result */}
          {result && (
            <Text style={[styles.result, { color: result.success ? colors.success : colors.error }]}>
              {result.message}
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={onDismiss}
              style={styles.cancelBtn}
              textColor={colors.textDim}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConvert}
              loading={loading}
              disabled={!canConvert || loading}
              style={styles.convertBtn}
              buttonColor={colors.primary}
              textColor="#000"
              labelStyle={{ fontWeight: '700' }}
            >
              Convert
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
    maxHeight: '90%',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  currencyPicker: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  currencyChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  currencyChipText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  balanceText: {
    fontSize: fontSize.sm,
    color: colors.textDim,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.lg,
  },
  rateBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rateLabel: {
    color: colors.textDim,
    fontSize: fontSize.md,
  },
  rateValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  result: {
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    borderColor: colors.border,
  },
  convertBtn: {
    flex: 1,
  },
});
