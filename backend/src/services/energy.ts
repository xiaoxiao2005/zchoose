import { db } from '../db/init';

function ensureEnergy(userId: number): void {
  const row = db.prepare('SELECT user_id FROM user_energy WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO user_energy (user_id, energy, updated_at) VALUES (?, 0, datetime("now"))').run(userId);
  }
}

export function getEnergy(userId: number): number {
  ensureEnergy(userId);
  const row = db.prepare('SELECT energy FROM user_energy WHERE user_id = ?').get(userId) as { energy: number };
  return row?.energy ?? 0;
}

export function addEnergy(userId: number, delta: number): number {
  ensureEnergy(userId);
  if (delta <= 0) return getEnergy(userId);
  db.prepare('UPDATE user_energy SET energy = energy + ?, updated_at = datetime("now") WHERE user_id = ?').run(delta, userId);
  return getEnergy(userId);
}
