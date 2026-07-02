# Architecture

## Stack

- Mobile: React Native + Expo
- Local DB: Expo SQLite
- Remote DB: Supabase PostgreSQL
- Sync: client-side push/pull, last-write-wins
- Weekly coach: Supabase Edge Function + Scheduled Function
- Notifications: Expo Notifications

## Local-first sync

Every editable table has:

- `sync_status`: `local_only`, `synced`, `modified`, `conflict`
- `created_at`
- `updated_at`
- `deleted_at`

MVP rule:

- Insert offline as `local_only`
- Edit a synced row as `modified`
- Soft delete by setting `deleted_at` and `modified`
- Push `local_only` and `modified` rows with Supabase upsert
- Pull remote rows and apply last-write-wins by `updated_at`
- Keep local data when push fails

## Weekly review schedule

- Sunday 20:00 JST: local notification prompt for reflection
- Sunday 22:00 JST: Supabase Scheduled Function calls `generate-weekly-review`
- Review window: Monday 00:00 through Sunday 23:59 JST
- Manual regeneration calls the same function with `force: true`

## App structure

- `App.tsx`: 5-tab shell (ホーム / 筋トレ / 食事 / 体重 / レビュー) + 設定・管理 overlay (gear icon on Home)
- `src/theme.ts`: design tokens (colors, radius, shadow)
- `src/components/`: `Screen` wrapper, `ui.tsx` (Card/Button/Chip/Segmented/ProgressBar/Stepper/Field/Badge/confirmDelete), `charts.tsx` (dependency-free bar charts)
- `src/screens/`: one file per tab + `ManageScreen` (種目 / 食材 / テンプレート / ジム店舗 / 目標 / 同期)
- `src/db/client.ts`: all SQLite reads/writes; every mutation touches `updated_at` and demotes `synced` → `modified`
- `src/services/`: `sync.ts` (push/pull + pending count), `review.ts` (sync → Edge Function invoke → save locally), `notifications.ts`

Dates are formatted in the device's local timezone (`todayISO`); UTC-based
formatting was a bug that shifted pre-9am JST records to the previous day.

## MVP limitations

- Auth and multi-user isolation are intentionally omitted for personal use
- Conflict UI is represented in data model but not yet surfaced
- Comparison filter is per gym location; per-machine (EquipmentInstance) filtering is in the schema but not yet in the input flow
- Meal templates store default macros; linking an ingredient list to a template is not yet implemented (apply-time multiplier is supported)
