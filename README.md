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

## Supabase

- DBスキーマ: `supabase/migrations/0001_initial.sql`
- 週次レビューEdge Function: `supabase/functions/generate-weekly-review/index.ts`
- 日曜22:00 JSTのcron相当は Supabase Scheduled Functions で `generate-weekly-review` を呼びます。
