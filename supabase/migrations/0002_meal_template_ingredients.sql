-- テンプレートに材料リストを紐づける
create table if not exists meal_template_ingredients (
  id text primary key,
  meal_template_id text not null references meal_templates(id) on delete cascade,
  ingredient_id text not null references ingredients(id),
  amount_g numeric not null,
  sync_status sync_status not null default 'synced',
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_meal_template_ingredients_template
  on meal_template_ingredients(meal_template_id);
