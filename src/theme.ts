// デザイントークン。画面間で色・角丸・余白を統一する。
// ダークで硬派なジムアプリ: 鉄黒のベース × エレクトリックライムのアクセント。
export const colors = {
  bg: '#0C0D10',
  card: '#15171C',
  border: '#23262E',
  borderStrong: '#343945',
  ink: '#F3F4F6',
  sub: '#A6ACB8',
  faint: '#5F6672',
  primary: '#CCFF3D',
  primaryPressed: '#A8D42E',
  primarySoft: '#1E2513',
  primaryBorder: '#3E4A1D',
  brass: '#FFC94A',
  danger: '#FF5D49',
  dangerSoft: '#2A1310',
  warn: '#FFB020',
  warnSoft: '#2A2008',
  success: '#3DDC84',
  successSoft: '#0F2A1B',
  // マクロ栄養素の色
  kcal: '#CCFF3D',
  protein: '#FF6B5E',
  fat: '#FFB020',
  carbs: '#4EA8FF',
  // タブバー
  tabBg: '#101116',
  tabBorder: '#23262E',
  tabActive: '#CCFF3D',
  tabInactive: '#5F6672'
} as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  button: {
    shadowColor: '#CCFF3D',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  }
} as const;
