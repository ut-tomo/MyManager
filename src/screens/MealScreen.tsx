import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Badge, Button, Card, Chip, EmptyState, Field, Segmented, SectionTitle, confirmDelete } from '../components/ui';
import {
  addIngredientBasedMeal,
  addMealEntry,
  applyMealTemplate,
  copyMealEntry,
  getDailyNutrition,
  getIngredients,
  getMeals,
  getMealTemplates,
  getProfile,
  getRecentMealEntries,
  softDelete,
  updateMealEntry,
  type IngredientRow,
  type MealTemplateRow
} from '../db/client';
import { colors } from '../theme';
import type { Confidence, DailyNutritionSummary, MealEntry, MealType, UserProfile } from '../types';
import { todayISO } from '../utils/date';

const MEAL_TYPE_OPTIONS: Array<{ value: MealType; label: string }> = [
  { value: 'breakfast', label: '朝' },
  { value: 'lunch', label: '昼' },
  { value: 'dinner', label: '夜' },
  { value: 'snack', label: '間食' },
  { value: 'other', label: '他' }
];

const MEAL_TYPE_LABEL: Record<string, string> = { breakfast: '朝', lunch: '昼', dinner: '夜', snack: '間食', other: '他' };
const CONFIDENCE_LABEL: Record<Confidence, string> = { exact: '正確', estimated: '推定', rough: '概算' };

type InputMode = 'manual' | 'template' | 'recent' | 'ingredient';

export function MealScreen({ refresh, refreshKey }: { refresh: () => void; refreshKey: number }) {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [nutrition, setNutrition] = useState<DailyNutritionSummary | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [mode, setMode] = useState<InputMode>('manual');
  const [editing, setEditing] = useState<MealEntry | null>(null);

  // 概算入力フォーム
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [confidence, setConfidence] = useState<Confidence>('estimated');
  const [note, setNote] = useState('');

  // テンプレート
  const [templates, setTemplates] = useState<MealTemplateRow[]>([]);
  const [multiplier, setMultiplier] = useState<'0.5' | '1' | '1.5' | 'custom'>('1');
  const [customMultiplier, setCustomMultiplier] = useState('1.2');

  // 最近から
  const [recent, setRecent] = useState<MealEntry[]>([]);

  // 材料ベース
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [ingredientRows, setIngredientRows] = useState<Array<{ ingredient: IngredientRow; grams: string }>>([]);
  const [ingredientMealName, setIngredientMealName] = useState('');

  const load = useCallback(async () => {
    const [m, n, p, t, r, i] = await Promise.all([
      getMeals(),
      getDailyNutrition(),
      getProfile(),
      getMealTemplates(),
      getRecentMealEntries(),
      getIngredients()
    ]);
    setMeals(m);
    setNutrition(n);
    setProfile(p);
    setTemplates(t);
    setRecent(r);
    setIngredients(i);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function resetForm() {
    setName('');
    setCalories('');
    setProtein('');
    setFat('');
    setCarbs('');
    setNote('');
    setConfidence('estimated');
    setEditing(null);
  }

  async function saveManual() {
    const kcal = Math.round(Number(calories));
    if (!name.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
    const macros = {
      protein_g: protein ? Number(protein) : null,
      fat_g: fat ? Number(fat) : null,
      carbs_g: carbs ? Number(carbs) : null
    };
    if (editing) {
      await updateMealEntry(editing.id, { name: name.trim(), meal_type: mealType, calories_kcal: kcal, ...macros, confidence, note: note || null });
    } else {
      await addMealEntry({
        date: todayISO(),
        meal_type: mealType,
        name: name.trim(),
        calories_kcal: kcal,
        ...macros,
        input_type: 'manual_estimate',
        confidence,
        source: 'user_estimate',
        note: note || null
      });
    }
    resetForm();
    await load();
    refresh();
  }

  function startEdit(meal: MealEntry) {
    setMode('manual');
    setEditing(meal);
    setMealType(meal.meal_type);
    setName(meal.name);
    setCalories(String(meal.calories_kcal));
    setProtein(meal.protein_g != null ? String(meal.protein_g) : '');
    setFat(meal.fat_g != null ? String(meal.fat_g) : '');
    setCarbs(meal.carbs_g != null ? String(meal.carbs_g) : '');
    setConfidence(meal.confidence);
    setNote(meal.note ?? '');
  }

  async function applyTemplate(template: MealTemplateRow) {
    const factor = multiplier === 'custom' ? Number(customMultiplier) : Number(multiplier);
    if (!Number.isFinite(factor) || factor <= 0) return;
    await applyMealTemplate(template, mealType, factor);
    await load();
    refresh();
  }

  async function copyRecent(meal: MealEntry) {
    await copyMealEntry(meal, mealType);
    await load();
    refresh();
  }

  function addIngredientRow(ingredient: IngredientRow) {
    if (ingredientRows.some((row) => row.ingredient.id === ingredient.id)) return;
    setIngredientRows((rows) => [...rows, { ingredient, grams: '100' }]);
  }

  const ingredientTotals = ingredientRows.reduce(
    (sum, row) => {
      const grams = Number(row.grams) || 0;
      return {
        kcal: sum.kcal + (row.ingredient.calories_per_100g * grams) / 100,
        protein: sum.protein + (row.ingredient.protein_per_100g * grams) / 100,
        fat: sum.fat + (row.ingredient.fat_per_100g * grams) / 100,
        carbs: sum.carbs + (row.ingredient.carbs_per_100g * grams) / 100
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );

  async function saveIngredientMeal() {
    if (!ingredientMealName.trim() || ingredientRows.length === 0) return;
    const rows = ingredientRows
      .map((row) => ({ ingredient: row.ingredient, grams: Number(row.grams) || 0 }))
      .filter((row) => row.grams > 0);
    if (rows.length === 0) return;
    await addIngredientBasedMeal(ingredientMealName.trim(), mealType, rows);
    setIngredientMealName('');
    setIngredientRows([]);
    await load();
    refresh();
  }

  const missingTotal = (nutrition?.missingProtein ?? 0) + (nutrition?.missingFat ?? 0) + (nutrition?.missingCarbs ?? 0);

  return (
    <Screen title="食事" subtitle={todayISO()}>
      {/* 今日の合計 */}
      <Card>
        <View style={styles.totalsRow}>
          <Total label="kcal" value={nutrition?.calories ?? 0} target={profile?.daily_calorie_target} color={colors.kcal} />
          <Total label="P" value={r1(nutrition?.protein ?? 0)} target={profile?.protein_target_g} color={colors.protein} />
          <Total label="F" value={r1(nutrition?.fat ?? 0)} target={profile?.fat_target_g} color={colors.fat} />
          <Total label="C" value={r1(nutrition?.carbs ?? 0)} target={profile?.carbs_target_g} color={colors.carbs} />
        </View>
        {missingTotal > 0 ? (
          <Text style={styles.warning}>
            PFC未入力あり: P{nutrition?.missingProtein} / F{nutrition?.missingFat} / C{nutrition?.missingCarbs} 件（合計は既知分のみ）
          </Text>
        ) : null}
      </Card>

      {/* 入力 */}
      <SectionTitle>記録する</SectionTitle>
      <Segmented value={mealType} options={MEAL_TYPE_OPTIONS} onChange={setMealType} />
      <Segmented
        value={mode}
        options={[
          { value: 'manual', label: '概算' },
          { value: 'template', label: 'テンプレ' },
          { value: 'recent', label: '最近から' },
          { value: 'ingredient', label: '材料' }
        ]}
        onChange={(m) => {
          setMode(m);
          if (m !== 'manual') setEditing(null);
        }}
      />

      {mode === 'manual' ? (
        <Card>
          {editing ? (
            <View style={styles.editingBanner}>
              <Badge label="編集中" tone="warn" />
              <Pressable onPress={resetForm} hitSlop={8}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </Pressable>
            </View>
          ) : null}
          <Field label="食事名" value={name} onChangeText={setName} placeholder="例: つけ麺 大盛り" />
          <View style={styles.rowGap}>
            <Field label="kcal（必須）" value={calories} onChangeText={setCalories} placeholder="1100" keyboardType="number-pad" flex />
            <Field label="P (g)" value={protein} onChangeText={setProtein} placeholder="-" keyboardType="decimal-pad" flex />
            <Field label="F (g)" value={fat} onChangeText={setFat} placeholder="-" keyboardType="decimal-pad" flex />
            <Field label="C (g)" value={carbs} onChangeText={setCarbs} placeholder="-" keyboardType="decimal-pad" flex />
          </View>
          <Text style={styles.fieldLabel}>信頼度</Text>
          <Segmented
            value={confidence}
            options={[
              { value: 'exact', label: '正確' },
              { value: 'estimated', label: '推定' },
              { value: 'rough', label: '概算' }
            ]}
            onChange={setConfidence}
          />
          <Field label="メモ（任意）" value={note} onChangeText={setNote} placeholder="スープは半分残した など" />
          <Button label={editing ? '更新する' : '保存する'} icon="checkmark" size="lg" onPress={saveManual} style={{ marginTop: 14 }} />
        </Card>
      ) : null}

      {mode === 'template' ? (
        <Card>
          <Text style={styles.fieldLabel}>倍率</Text>
          <Segmented
            value={multiplier}
            options={[
              { value: '0.5', label: '0.5倍' },
              { value: '1', label: '1.0倍' },
              { value: '1.5', label: '1.5倍' },
              { value: 'custom', label: 'カスタム' }
            ]}
            onChange={setMultiplier}
          />
          {multiplier === 'custom' ? (
            <Field label="カスタム倍率" value={customMultiplier} onChangeText={setCustomMultiplier} keyboardType="decimal-pad" />
          ) : null}
          {templates.length === 0 ? <EmptyState icon="bookmark-outline" message="テンプレートは設定画面から登録できます" /> : null}
          {templates.map((template) => (
            <Pressable key={template.id} style={styles.pickRow} onPress={() => applyTemplate(template)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickTitle}>{template.name}</Text>
                <Text style={styles.pickSub}>
                  {template.default_calories_kcal}kcal / P{template.default_protein_g ?? '-'} F{template.default_fat_g ?? '-'} C{template.default_carbs_g ?? '-'}
                </Text>
              </View>
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {mode === 'recent' ? (
        <Card>
          {recent.length === 0 ? <EmptyState icon="time-outline" message="まだ食事の記録がありません" /> : null}
          {recent.map((meal) => (
            <Pressable key={meal.id} style={styles.pickRow} onPress={() => copyRecent(meal)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickTitle}>{meal.name}</Text>
                <Text style={styles.pickSub}>
                  {meal.calories_kcal}kcal / P{meal.protein_g ?? '-'} F{meal.fat_g ?? '-'} C{meal.carbs_g ?? '-'} ・ {meal.date}
                </Text>
              </View>
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {mode === 'ingredient' ? (
        <Card>
          <Field label="食事名" value={ingredientMealName} onChangeText={setIngredientMealName} placeholder="例: 鶏むね丼" />
          <Text style={styles.fieldLabel}>食材を追加（設定画面で登録できます）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ingredients.map((ingredient) => (
              <Chip key={ingredient.id} label={ingredient.name} sub={`${ingredient.calories_per_100g}kcal/100g`} onPress={() => addIngredientRow(ingredient)} />
            ))}
          </ScrollView>
          {ingredients.length === 0 ? <EmptyState icon="nutrition-outline" message="食材が未登録です" /> : null}
          {ingredientRows.map((row, index) => (
            <View key={row.ingredient.id} style={styles.ingredientRow}>
              <Text style={styles.pickTitle}>{row.ingredient.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 88 }}>
                  <Field
                    value={row.grams}
                    onChangeText={(v) => setIngredientRows((rows) => rows.map((r, i) => (i === index ? { ...r, grams: v } : r)))}
                    keyboardType="number-pad"
                    placeholder="g"
                  />
                </View>
                <Text style={styles.pickSub}>g</Text>
                <Pressable onPress={() => setIngredientRows((rows) => rows.filter((_, i) => i !== index))} hitSlop={6}>
                  <Ionicons name="close-circle" size={22} color={colors.faint} />
                </Pressable>
              </View>
            </View>
          ))}
          {ingredientRows.length > 0 ? (
            <>
              <Text style={styles.totalsText}>
                合計 {Math.round(ingredientTotals.kcal)}kcal / P{r1(ingredientTotals.protein)} F{r1(ingredientTotals.fat)} C{r1(ingredientTotals.carbs)}
              </Text>
              <Button label="この内容で保存" icon="checkmark" onPress={saveIngredientMeal} style={{ marginTop: 10 }} />
            </>
          ) : null}
        </Card>
      ) : null}

      {/* 今日の食事一覧 */}
      <SectionTitle>今日の記録</SectionTitle>
      {meals.length === 0 ? <EmptyState icon="restaurant-outline" message="まだ記録がありません" /> : null}
      {meals.map((meal) => (
        <View key={meal.id} style={styles.mealRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Badge label={MEAL_TYPE_LABEL[meal.meal_type] ?? '他'} tone="primary" />
              <Text style={styles.pickTitle} numberOfLines={1}>{meal.name}</Text>
            </View>
            <Text style={styles.pickSub}>
              {meal.calories_kcal}kcal / P{meal.protein_g ?? '未'} F{meal.fat_g ?? '未'} C{meal.carbs_g ?? '未'} ・ {CONFIDENCE_LABEL[meal.confidence]}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Pressable onPress={() => startEdit(meal)} hitSlop={6}>
              <Ionicons name="pencil" size={18} color={colors.sub} />
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(meal.name, async () => {
                await softDelete('meal_entries', meal.id);
                await load();
                refresh();
              })}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={18} color={colors.faint} />
            </Pressable>
          </View>
        </View>
      ))}
    </Screen>
  );
}

function Total({ label, value, target, color }: { label: string; value: number; target?: number | null; color: string }) {
  return (
    <View style={styles.total}>
      <Text style={[styles.totalLabel, { color }]}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalTarget}>/ {target ?? '-'}</Text>
    </View>
  );
}

function r1(value: number): number {
  return Math.round(value * 10) / 10;
}

// 時間帯からデフォルトのmeal_typeを推定して入力を1タップ減らす
function defaultMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  total: { flex: 1, alignItems: 'center' },
  totalLabel: { fontSize: 12, fontWeight: '800' },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 2 },
  totalTarget: { fontSize: 11, color: colors.faint },
  warning: { color: colors.warn, marginTop: 12, fontWeight: '700', fontSize: 12 },
  rowGap: { flexDirection: 'row', gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 12 },
  editingBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cancelText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: '#F1F3F6', paddingVertical: 8 },
  pickTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pickSub: { fontSize: 12, color: colors.sub, marginTop: 2 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10 },
  totalsText: { marginTop: 12, fontWeight: '800', color: colors.ink },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 8 }
});
