import { db } from '../db/init';

/**
 * 记录一次穿搭选择（试衣或选择推荐时调用）
 */
export function addOutfitRecord(
  userId: number,
  outfitId: number,
  options?: { occasion?: string; weatherTemp?: number; weatherDesc?: string }
): void {
  db.prepare(
    'INSERT INTO outfit_records (user_id, outfit_id, occasion, weather_temp, weather_desc) VALUES (?, ?, ?, ?, ?)'
  ).run(
    userId,
    outfitId,
    options?.occasion ?? null,
    options?.weatherTemp ?? null,
    options?.weatherDesc ?? null
  );
}
