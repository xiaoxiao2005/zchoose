import { db } from '../db/init';

const INITIAL_POINTS = 50;
type PointSource = 'init' | 'submission' | 'membership' | 'admin' | 'unlock' | 'other';
interface PointChangeMeta {
  reason?: string;
  source?: PointSource;
  refId?: number | null;
}

function logPointChange(userId: number, changeAmount: number, meta?: PointChangeMeta): void {
  if (!Number.isFinite(changeAmount) || changeAmount === 0) return;
  db.prepare(
    'INSERT INTO user_points_ledger (user_id, change_amount, reason, source, ref_id) VALUES (?, ?, ?, ?, ?)'
  ).run(
    userId,
    changeAmount,
    meta?.reason ?? null,
    meta?.source ?? 'other',
    meta?.refId ?? null
  );
}

/** 确保用户有积分记录；新用户或已有记录但为 0 的均设为初始 50 积分 */
export function ensureUserPoints(userId: number): void {
  const row = db.prepare('SELECT user_id, points FROM user_points WHERE user_id = ?').get(userId) as
    | { user_id: number; points: number }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO user_points (user_id, points, updated_at) VALUES (?, ?, datetime("now"))').run(userId, INITIAL_POINTS);
    logPointChange(userId, INITIAL_POINTS, { reason: '新用户初始积分', source: 'init' });
    return;
  }
  if (row.points === 0) {
    db.prepare('UPDATE user_points SET points = ?, updated_at = datetime("now") WHERE user_id = ?').run(INITIAL_POINTS, userId);
    logPointChange(userId, INITIAL_POINTS, { reason: '积分初始化补发', source: 'init' });
  }
}

/** 查询当前积分 */
export function getPoints(userId: number): number {
  ensureUserPoints(userId);
  const row = db.prepare('SELECT points FROM user_points WHERE user_id = ?').get(userId) as { points: number };
  return row?.points ?? INITIAL_POINTS;
}

/** 增加积分（delta 为正）；返回变更后的积分，不足时返回 -1 不扣减 */
export function addPoints(userId: number, delta: number, meta?: PointChangeMeta): number {
  ensureUserPoints(userId);
  if (delta <= 0) return getPoints(userId);
  db.prepare('UPDATE user_points SET points = points + ?, updated_at = datetime("now") WHERE user_id = ?').run(delta, userId);
  logPointChange(userId, delta, meta);
  return getPoints(userId);
}

/** 扣减积分（delta 为正）；成功返回变更后积分，不足时返回 -1 且不扣减 */
export function deductPoints(userId: number, delta: number, meta?: PointChangeMeta): number {
  ensureUserPoints(userId);
  if (delta <= 0) return getPoints(userId);
  const cur = getPoints(userId);
  if (cur < delta) return -1;
  db.prepare('UPDATE user_points SET points = points - ?, updated_at = datetime("now") WHERE user_id = ?').run(delta, userId);
  logPointChange(userId, -delta, meta);
  return cur - delta;
}

export function listRecentPointLogs(userId: number, limit: number = 20): {
  id: number;
  change_amount: number;
  reason?: string | null;
  source?: string | null;
  ref_id?: number | null;
  created_at: string;
}[] {
  ensureUserPoints(userId);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  return db.prepare(
    'SELECT id, change_amount, reason, source, ref_id, created_at FROM user_points_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, safeLimit) as {
    id: number;
    change_amount: number;
    reason?: string | null;
    source?: string | null;
    ref_id?: number | null;
    created_at: string;
  }[];
}
