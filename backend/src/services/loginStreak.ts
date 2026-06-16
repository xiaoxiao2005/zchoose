import { db } from '../db/init';
import { addEnergy } from './energy';

function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ensureStreak(userId: number): void {
  const row = db.prepare('SELECT user_id FROM user_login_streak WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare(
      'INSERT INTO user_login_streak (user_id, streak_days, last_login_date, updated_at) VALUES (?, 0, NULL, datetime("now"))'
    ).run(userId);
  }
}

/** 记录本次登录，更新累计登录天数并发放当日时尚能量（仅当日首次登录生效） */
export function recordLogin(userId: number): { streakDays: number; energyAdded: number } {
  ensureStreak(userId);
  const today = todayStr();
  const row = db.prepare('SELECT streak_days, last_login_date FROM user_login_streak WHERE user_id = ?').get(userId) as
    | { streak_days: number; last_login_date: string | null }
    | undefined;
  const last = row?.last_login_date ?? null;
  let streakDays = row?.streak_days ?? 0;

  if (last === today) {
    return { streakDays, energyAdded: 0 };
  }
  // 产品语义为“已登录 X 天（累计）”，不要求连续，非同一天首次登录即 +1
  streakDays = Math.max(0, streakDays) + 1;

  db.prepare(
    'UPDATE user_login_streak SET streak_days = ?, last_login_date = ?, updated_at = datetime("now") WHERE user_id = ?'
  ).run(streakDays, today, userId);

  // 已登录即加：每次当日首次登录加固定时尚能量，不再按“连续登录”加成
  const energyAdded = 30;
  addEnergy(userId, energyAdded);

  return { streakDays, energyAdded };
}

export function getStreak(userId: number): number {
  ensureStreak(userId);
  const row = db.prepare('SELECT streak_days FROM user_login_streak WHERE user_id = ?').get(userId) as {
    streak_days: number;
  };
  return row?.streak_days ?? 0;
}
