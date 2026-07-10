# MyManager

個人利用向けの training diary + nutrition diary + weekly coach モバイルアプリです。Pixelでのジム中入力を優先し、React Native + Expo + Supabase を前提にしています。

## 方針

- ワークアウト、食事、体重はローカルSQLiteへ即時保存
- `sync_status` は `local_only` / `synced` / `modified` / `conflict`
- Supabase PostgreSQLはバックアップ、複数端末同期、Edge Functions、cron用
- MVPの競合解決は last-write-wins
- 削除は `deleted_at` を使ったsoft delete

## 開発

```bash
npm install
npm run typecheck
npm run android
```

Expo Go または Android Emulator / 実機Pixelから確認します。

## Supabase セットアップ手順

同期・週次レビューを有効にするには以下が必要です（未設定でもローカル機能はすべて動きます）。

### 1. プロジェクト作成とマイグレーション

```bash
supabase link --project-ref <your-project-ref>
supabase db push   # 0001_initial + 0002_meal_template_ingredients を適用
```

### 2. アプリの接続情報

```bash
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を記入
npx expo start --clear
```

設定タブ > 同期 で「接続設定あり」になれば完了。起動時に自動同期され、手動同期も可能です。

### 3. 週次レビュー（LLM）

LLMのAPIキーは**アプリ側ではなくSupabaseのSecretsに**入れます（端末には一切保存されません）。

```bash
supabase functions deploy generate-weekly-review
supabase secrets set OPENAI_API_KEY=sk-...
```

動作確認（手動実行）:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/generate-weekly-review" \
  -H "Authorization: Bearer <anon-key>" -H "Content-Type: application/json" -d '{}'
```

### 4. 日曜22:00 JSTの自動実行

Supabaseダッシュボード > Integrations > Cron（pg_cron）で以下を登録します（22:00 JST = 13:00 UTC）:

```sql
select cron.schedule(
  'weekly-review',
  '0 13 * * 0',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/generate-weekly-review',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon-key>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

（pg_net拡張が必要です。ダッシュボードのDatabase > Extensionsで `pg_net` と `pg_cron` を有効化）

生成されたレビューとCoachMemoryは、アプリ起動時の自動同期またはレビュータブの「同期して更新」で取り込まれます。

## セキュリティに関する注意

個人利用前提のため認証・RLSは実装していません。anonキーが漏れるとDBを読み書きされ得るので、`.env` やAPKを公開しないでください。一般公開する場合はSupabase Auth + RLSの追加が必要です。
