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

- Sunday 20:00 JST: local notification prompt for reflection (scheduled once at app start, dedup by title)
- Sunday 22:00 JST: Supabase Scheduled Function calls `generate-weekly-review`
- Review window: Monday 00:00 through Sunday 23:59 JST
- The app has no manual-generation UI (by design); the Review tab's "同期して更新" pulls generated reviews via normal sync

## App structure

- `App.tsx`: 6-tab shell (ホーム / 筋トレ / 食事 / 体重 / レビュー / 設定), tab bar respects the bottom safe-area inset
- `src/theme.ts`: design tokens (dark theme: near-black base, electric-lime accent, gold for top-set highlights)
- Gym location is chosen at session start (chips above "Start Workout"); defaults seeded: Anytime Fitness 秋葉原 / 新御徒町 / 御茶ノ水
- Machine/cable exercises support EquipmentInstance: per-exercise machine chips at the session's gym (inline "+ マシン追加"), auto-reassigns the machine last used at that gym; analysis has 全マシン/individual filter chips
- Analysis charts show all gyms combined by default; long-pressing a bar reveals that day's detail incl. gym and machine names
- Meal templates can link an ingredient list (meal_template_ingredients); defaults are recomputed from ingredients on save
- `src/components/`: `Screen` wrapper, `ui.tsx` (Card/Button/Chip/Segmented/ProgressBar/Stepper/Field/Badge/confirmDelete), `charts.tsx` (dependency-free bar charts)
- `src/screens/`: one file per tab + `ManageScreen` (種目 / 食材 / テンプレート / ジム店舗 / 目標 / 同期)
- `src/db/client.ts`: all SQLite reads/writes; every mutation touches `updated_at` and demotes `synced` → `modified`
- `src/services/`: `sync.ts` (push/pull + pending count), `review.ts` (sync → Edge Function invoke → save locally), `notifications.ts`

Dates are formatted in the device's local timezone (`todayISO`); UTC-based
formatting was a bug that shifted pre-9am JST records to the previous day.

## MVP limitations

- Auth and multi-user isolation are intentionally omitted for personal use
- Conflict UI is represented in data model but not yet surfaced
- Applying a template records scaled macros only; the linked ingredient list is not expanded into meal_ingredients
