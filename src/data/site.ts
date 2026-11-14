export const siteMeta = {
  name: 'BWR Engineering Lab',
  version: '3.2.0',
  creator: 'Hexamika',
  purpose: 'Menyediakan lingkungan belajar interaktif untuk memahami arsitektur sistem Boiling Water Reactor (BWR), hubungan antarsistem, instrumentasi, dinamika lambat, dan batas pemodelan rekayasa melalui model edukasi sintetis.',
  developmentCredit: 'Konsep proyek dan arahan produk oleh Hexamika. perbaikan bug dan tampilan dibantu oleh chatgpt.',
} as const;
export type AppRoute = 'simulation' | 'learn' | 'about';
