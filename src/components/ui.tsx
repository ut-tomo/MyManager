import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { colors, radius, shadow } from '../theme';

// ---- カード ----
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

// ---- ボタン ----
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'lg' | 'md' | 'sm';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const height = size === 'lg' ? 56 : size === 'md' ? 46 : 38;
  const fontSize = size === 'lg' ? 17 : size === 'md' ? 15 : 13;
  const iconSize = size === 'lg' ? 22 : 18;
  const palette = {
    primary: { bg: colors.primary, fg: '#0E1006', border: colors.primary, pressed: colors.primaryPressed },
    secondary: { bg: '#1C1F26', fg: colors.ink, border: colors.borderStrong, pressed: '#242834' },
    ghost: { bg: colors.card, fg: colors.sub, border: colors.border, pressed: '#1B1E25' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: '#4A2620', pressed: '#3A1B15' }
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: height,
          borderRadius: size === 'lg' ? radius.lg : radius.md,
          backgroundColor: pressed && !disabled ? palette.pressed : palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: size === 'lg' ? 18 : 14,
          opacity: disabled ? 0.42 : 1,
          transform: [{ scale: pressed && !disabled ? 0.99 : 1 }]
        },
        variant === 'primary' && shadow.button,
        style
      ]}
    >
      {icon ? <Ionicons name={icon} size={iconSize} color={palette.fg} /> : null}
      <Text style={{ color: palette.fg, fontWeight: '800', fontSize }}>{label}</Text>
    </Pressable>
  );
}

// ---- チップ ----
export function Chip({
  label,
  selected,
  onPress,
  sub
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  sub?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      {sub ? <Text style={styles.chipSub}>{sub}</Text> : null}
    </Pressable>
  );
}

// ---- セグメント ----
export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.segment, value === option.value && styles.segmentActive]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]} numberOfLines={1}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---- 進捗バー（カロリー/PFC用）----
export function ProgressBar({
  label,
  current,
  target,
  color,
  unit,
  missingCount
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  unit: string;
  missingCount?: number;
}) {
  const ratio = target > 0 ? Math.min(current / target, 1) : 0;
  const over = target > 0 && current > target;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>
          <Text style={{ color: over ? colors.danger : colors.ink, fontWeight: '800' }}>{formatNumber(current)}</Text>
          <Text style={{ color: colors.faint }}> / {formatNumber(target)} {unit}</Text>
          {missingCount ? <Text style={{ color: colors.warn }}>  未入力{missingCount}件</Text> : null}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: over ? colors.danger : color }]} />
      </View>
    </View>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// ---- ステッパー付き数値入力（ジム中の高速入力用）----
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  decimals = 1
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  decimals?: number;
}) {
  function bump(direction: 1 | -1) {
    const current = Number(value) || 0;
    const next = Math.max(min, current + step * direction);
    onChange(decimals > 0 ? String(Math.round(next * 10 ** decimals) / 10 ** decimals) : String(Math.round(next)));
  }
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable style={styles.stepperButton} onPress={() => bump(-1)}>
          <Ionicons name="remove" size={22} color={colors.primary} />
        </Pressable>
        <TextInput
          style={styles.stepperInput}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <Pressable style={styles.stepperButton} onPress={() => bump(1)}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

// ---- ラベル付き入力 ----
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  flex
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
  flex?: boolean;
}) {
  return (
    <View style={[flex && { flex: 1 }]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
      />
    </View>
  );
}

// ---- バッジ ----
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' | 'warn' | 'danger' | 'success' }) {
  const palette = {
    neutral: { bg: '#23262E', fg: colors.sub },
    primary: { bg: colors.primarySoft, fg: colors.primary },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.successSoft, fg: colors.success }
  }[tone];
  return (
    <View style={{ backgroundColor: palette.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, message }: { icon: keyof typeof Ionicons.glyphMap; message: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={28} color={colors.faint} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// 削除確認（破壊的操作の誤操作防止）
export function confirmDelete(title: string, onConfirm: () => void) {
  Alert.alert('削除の確認', `${title} を削除しますか？`, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除する', style: 'destructive', onPress: onConfirm }
  ]);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
    ...shadow.card
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, letterSpacing: 0.4 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  chipTextSelected: { color: colors.primary },
  chipSub: { color: colors.faint, fontSize: 10, marginTop: 1 },
  segmented: { flexDirection: 'row', backgroundColor: '#1A1D23', borderRadius: radius.md, padding: 3, marginTop: 10, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, minHeight: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentActive: { backgroundColor: '#2A2F3A' },
  segmentText: { color: colors.sub, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: colors.primary },
  progressRow: { marginTop: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressLabel: { fontSize: 13, fontWeight: '800', color: colors.sub },
  progressValue: { fontSize: 13 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: '#23262E', marginTop: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  stepper: { flex: 1 },
  stepperLabel: { fontSize: 12, fontWeight: '800', color: colors.sub, marginBottom: 4 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperButton: {
    width: 38,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepperInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink
  },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.sub, marginBottom: 4, marginTop: 8 },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.ink
  },
  textarea: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { color: colors.faint, fontSize: 13 }
});
