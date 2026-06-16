import { Router } from 'express';
import { db } from '../db/init';

export const douyinRouter = Router();

/** 用户提交抖音链接或截图（截图可为上传后的 URL），待核验点赞≥10 后解锁一套 */
douyinRouter.post('/claim', (req, res) => {
  const { userId, link, imageUrl } = req.body;
  if (!userId) return res.status(400).json({ error: '需要 userId' });
  if (!link && !imageUrl) return res.status(400).json({ error: '请提供 link（抖音链接）或 imageUrl（截图）' });
  const result = db.prepare(
    'INSERT INTO douyin_claims (user_id, link, image_url, status) VALUES (?, ?, ?, ?)'
  ).run(userId, link ?? null, imageUrl ?? null, 'pending');
  const row = db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

/** 用户查看自己的核销记录 */
douyinRouter.get('/claims/my/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const rows = db.prepare('SELECT * FROM douyin_claims WHERE user_id = ? ORDER BY id DESC').all(userId);
  res.json(rows);
});

/** 后台：核验通过，为用户解锁指定搭配（不扣积分）；后续可加鉴权 */
douyinRouter.post('/claims/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  const { outfitId } = req.body;
  if (!outfitId) return res.status(400).json({ error: '请提供 outfitId（通过后解锁的搭配）' });
  const claim = db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(id) as { user_id: number; status: string } | undefined;
  if (!claim) return res.status(404).json({ error: '记录不存在' });
  if (claim.status !== 'pending') return res.status(400).json({ error: '该记录已处理' });
  const oid = Number(outfitId);
  const outfit = db.prepare('SELECT id FROM outfits WHERE id = ?').get(oid);
  if (!outfit) return res.status(404).json({ error: '搭配不存在' });
  db.prepare('UPDATE douyin_claims SET status = ?, outfit_id = ?, reviewed_at = datetime("now") WHERE id = ?').run('approved', oid, id);
  db.prepare('INSERT OR IGNORE INTO user_unlocks (user_id, outfit_id) VALUES (?, ?)').run(claim.user_id, oid);
  const updated = db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(id);
  res.json({ claim: updated, unlocked: true, outfitId: oid });
});

/** 后台：拒绝 */
douyinRouter.post('/claims/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  const claim = db.prepare('SELECT id, status FROM douyin_claims WHERE id = ?').get(id);
  if (!claim) return res.status(404).json({ error: '记录不存在' });
  if ((claim as { status: string }).status !== 'pending') return res.status(400).json({ error: '该记录已处理' });
  db.prepare('UPDATE douyin_claims SET status = ?, reviewed_at = datetime("now") WHERE id = ?').run('rejected', id);
  const updated = db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(id);
  res.json(updated);
});

/** 后台：列表（待核验/全部），可选 ?status=pending */
douyinRouter.get('/claims', (req, res) => {
  const status = req.query.status as string | undefined;
  const sql = status ? 'SELECT * FROM douyin_claims WHERE status = ? ORDER BY id DESC' : 'SELECT * FROM douyin_claims ORDER BY id DESC';
  const rows = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
  res.json(rows);
});
