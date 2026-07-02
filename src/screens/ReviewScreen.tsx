import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Badge, Button, Card, EmptyState, Field, SectionTitle } from '../components/ui';
import { getCurrentWeekReview, getWeeklyReviews, upsertWeeklyReflection, type WeeklyReviewRow } from '../db/client';
import { generateWeeklyReview } from '../services/review';
import { scheduleWeeklyReflectionPrompt } from '../services/notifications';
import { colors } from '../theme';
import { addDaysISO, weekStartMondayISO } from '../utils/date';

type LlmOutput = {
  title?: string;
  overall_summary?: string;
  training_feedback?: FeedbackSection;
  nutrition_feedback?: FeedbackSection;
  next_week_actions?: string[];
  flags?: string[];
  disclaimer?: string;
};

type FeedbackSection = { positive?: string[]; concerns?: string[]; suggestions?: string[] };

export function ReviewScreen({ refreshKey }: { refreshKey: number }) {
  const [reflection, setReflection] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WeeklyReviewRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [current, all] = await Promise.all([getCurrentWeekReview(), getWeeklyReviews()]);
    // 保存済みの感想メモをプレフィルして続きから書けるようにする
    if (current?.user_reflection_text) setReflection((prev) => prev || current.user_reflection_text || '');
    setReviews(all as WeeklyReviewRow[]);
  }, []);

  useEffect(() => {
    load();
    // 日曜20:00の「感想を書きませんか？」通知を予約（権限がなければ静かに無視）
    scheduleWeeklyReflectionPrompt().catch(() => null);
  }, [load, refreshKey]);

  async function saveReflection() {
    await upsertWeeklyReflection(reflection);
    setSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    await load();
  }

  async function generate() {
    setGenerating(true);
    try {
      await upsertWeeklyReflection(reflection);
      const result = await generateWeeklyReview(reflection);
      if (!result.ok) {
        Alert.alert('生成できませんでした', result.message);
      }
      await load();
    } finally {
      setGenerating(false);
    }
  }

  const weekStart = weekStartMondayISO();
  const weekEnd = addDaysISO(weekStart, 6);

  return (
    <Screen title="週次レビュー" subtitle={`今週: ${weekStart} 〜 ${weekEnd}`}>
      {/* 感想メモ */}
      <Card>
        <Text style={styles.cardTitle}>今週の感想メモ</Text>
        <Text style={styles.hint}>週の途中でも自由に書き溜められます。日曜夜のレビュー生成時にLLMへ渡されます。</Text>
        <Field
          value={reflection}
          onChangeText={setReflection}
          placeholder="例: 今週は脚が重かった。ベンチは調子良かったが、睡眠が短かった。"
          multiline
        />
        <View style={styles.rowGap}>
          <Button label="感想を保存" icon="document-text-outline" variant="secondary" onPress={saveReflection} style={{ flex: 1 }} />
          <Button
            label={generating ? '生成中…' : 'レビューを生成'}
            icon="sparkles-outline"
            onPress={generate}
            disabled={generating}
            style={{ flex: 1 }}
          />
        </View>
        {savedAt ? <Text style={styles.savedText}>保存しました（{savedAt}）</Text> : null}
        {generating ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null}
        <Text style={styles.hint}>毎週日曜22:00 (JST) にも自動生成されます（Supabase側のスケジュール設定時）。</Text>
      </Card>

      {/* 過去レビュー */}
      <SectionTitle>レビュー一覧</SectionTitle>
      {reviews.length === 0 ? <EmptyState icon="sparkles-outline" message="まだレビューがありません" /> : null}
      {reviews.map((review) => {
        const output = parseOutput(review.llm_output_json);
        const expanded = expandedId === review.id;
        return (
          <Card key={review.id}>
            <Pressable onPress={() => setExpandedId(expanded ? null : review.id)}>
              <View style={styles.reviewHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewWeek}>{review.week_start_date} 〜 {review.week_end_date}</Text>
                  {output?.title ? <Text style={styles.reviewTitle}>{output.title}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge
                    label={review.status === 'generated' ? '生成済み' : review.status === 'regenerated' ? '再生成' : review.status === 'draft' ? '下書き' : review.status}
                    tone={review.status === 'draft' ? 'warn' : 'success'}
                  />
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.faint} />
                </View>
              </View>
            </Pressable>

            {expanded ? (
              <View style={{ marginTop: 8 }}>
                {review.user_reflection_text ? (
                  <>
                    <Text style={styles.blockLabel}>あなたの感想</Text>
                    <Text style={styles.bodyText}>{review.user_reflection_text}</Text>
                  </>
                ) : null}
                {output ? (
                  <>
                    {output.overall_summary ? (
                      <>
                        <Text style={styles.blockLabel}>総評</Text>
                        <Text style={styles.bodyText}>{output.overall_summary}</Text>
                      </>
                    ) : null}
                    <Feedback title="トレーニング" section={output.training_feedback} />
                    <Feedback title="食事" section={output.nutrition_feedback} />
                    {output.next_week_actions?.length ? (
                      <>
                        <Text style={styles.blockLabel}>来週のアクション</Text>
                        {output.next_week_actions.map((action, i) => (
                          <Text key={i} style={styles.actionText}>☐ {action}</Text>
                        ))}
                      </>
                    ) : null}
                    {output.flags?.length ? (
                      <>
                        <Text style={styles.blockLabel}>フラグ</Text>
                        {output.flags.map((flag, i) => (
                          <Text key={i} style={styles.bodyText}>・{flag}</Text>
                        ))}
                      </>
                    ) : null}
                    {output.disclaimer ? <Text style={styles.disclaimer}>{output.disclaimer}</Text> : null}
                  </>
                ) : (
                  <Text style={styles.hint}>LLMフィードバックはまだ生成されていません</Text>
                )}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

function Feedback({ title, section }: { title: string; section?: FeedbackSection }) {
  if (!section) return null;
  const rows: Array<{ icon: string; color: string; items: string[] }> = [
    { icon: '👍', color: colors.success, items: section.positive ?? [] },
    { icon: '⚠️', color: colors.warn, items: section.concerns ?? [] },
    { icon: '💡', color: colors.carbs, items: section.suggestions ?? [] }
  ];
  if (rows.every((row) => row.items.length === 0)) return null;
  return (
    <View>
      <Text style={styles.blockLabel}>{title}</Text>
      {rows.map((row) =>
        row.items.map((item, i) => (
          <Text key={`${row.icon}-${i}`} style={styles.bodyText}>
            {row.icon} {item}
          </Text>
        ))
      )}
    </View>
  );
}

function parseOutput(json?: string | null): LlmOutput | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as LlmOutput) : null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  hint: { color: colors.faint, fontSize: 12, marginTop: 6, lineHeight: 17 },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 12 },
  savedText: { color: colors.success, fontSize: 12, fontWeight: '700', marginTop: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewWeek: { fontSize: 12, fontWeight: '700', color: colors.sub },
  reviewTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 4 },
  blockLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, marginTop: 12, marginBottom: 4 },
  bodyText: { fontSize: 14, color: colors.ink, lineHeight: 21, marginTop: 2 },
  actionText: { fontSize: 14, color: colors.ink, lineHeight: 22, fontWeight: '600' },
  disclaimer: { fontSize: 11, color: colors.faint, marginTop: 14, lineHeight: 16 }
});
