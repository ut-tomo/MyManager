// デザイントークン。画面間で色・角丸・余白を統一する。
export const colors = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  border: '#E7E9EE',
  ink: '#171A20',
  sub: '#5B6472',
  faint: '#98A1B0',
  primary: '#0F766E',
  primarySoft: '#E6F5F3',
  primaryBorder: '#B7E3DE',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warn: '#B45309',
  warnSoft: '#FFF7E8',
  success: '#15803D',
  successSoft: '#EFFBF2',
  // マクロ栄養素の色
  kcal: '#0F766E',
  protein: '#E11D48',
  fat: '#F59E0B',
  carbs: '#2563EB'
} as const;

export const radius = { sm: 10, md: 14, lg: 18 } as const;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  }
} as const;
