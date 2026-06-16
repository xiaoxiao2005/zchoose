/**
 * 会员档位与价格（开通后下载试衣图无水印）
 */
export interface MembershipTier {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  duration: string;
}

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  { id: 'monthly', name: '月卡', price: 10, priceLabel: '¥10', duration: '30 天' },
  { id: 'quarterly', name: '季卡', price: 35, priceLabel: '¥35', duration: '90 天' },
  { id: 'yearly', name: '年卡', price: 100, priceLabel: '¥100', duration: '365 天' },
];
