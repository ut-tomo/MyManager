// ローカルタイムゾーン基準の YYYY-MM-DD。
// toISOString() は UTC のため、日本時間の朝9時前に記録すると前日扱いになるバグがあった。
export function todayISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function minutesBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.round(diff / 60000);
}

export function weekStartMondayISO(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return todayISO(d);
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

// ISO日時 → ローカル "HH:MM"（表示・編集用）
export function timeHM(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" + "HH:MM" → ISO日時（ローカル解釈）。不正入力は null。
export function combineDateTime(dateISO: string, hm: string): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hm.trim());
  if (!match) return null;
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d.toISOString();
}

export function formatKg(value: number): string {
  return `${value.toFixed(1)}kg`;
}

export function epley1rm(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}
