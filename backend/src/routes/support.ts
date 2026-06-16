import { Router } from 'express';
import { db } from '../db/init';
import { requireAuth, AuthRequest } from '../middleware/auth';

export const supportRouter = Router();

function isSupportReviewer(userId: number): boolean {
  const ids = (process.env.REVIEWER_USER_IDS || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
  if (ids.includes(userId)) return true;
  const phones = (process.env.REVIEWER_PHONES || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (phones.length === 0) return false;
  const user = db.prepare('SELECT phone FROM users WHERE id = ?').get(userId) as { phone?: string | null } | undefined;
  return !!(user?.phone && phones.includes(user.phone));
}

/** 客服对话：接收文本 + 可选图片；支持「转人工」标记与留言存储。当前 LLM 为占位，后续对接真实 API。 */
supportRouter.post('/chat', (req, res) => {
  const { userId, text, image_url, transferHuman, leaveMessage } = req.body;
  if (!userId) return res.status(400).json({ error: '需要 userId' });
  const uid = Number(userId);
  const content = typeof text === 'string' ? text : (leaveMessage || '');
  const isTransfer = Boolean(transferHuman);

  const now = new Date().toISOString();
  // 存用户消息（含转人工/留言），时间为发送当前时间
  db.prepare(
    'INSERT INTO support_messages (user_id, role, content, image_url, is_transfer_human, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uid, 'user', content || '(图片)', image_url ?? null, isTransfer ? 1 : 0, now);

  if (isTransfer) {
    const reply = '已转人工客服，我们会尽快联系您。您也可以留下更多说明，我们会一并处理。';
    db.prepare(
      'INSERT INTO support_messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    ).run(uid, 'assistant', reply, new Date().toISOString());
    return res.json({ reply, transferHuman: true });
  }

  // 占位：后续在此调用 LLM API，传入 text、image_url 及系统提示词（衣库介绍、购物链接说明等）
  const mockReply = '您好！这里是穿搭助手。您可以问我衣库搭配、购买链接，或上传搭配图询问。如需人工客服，请点击「转人工」并留言。';
  db.prepare(
    'INSERT INTO support_messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).run(uid, 'assistant', mockReply, new Date().toISOString());
  res.json({ reply: mockReply });
});

/** 用户侧：获取自己的客服历史（最近 N 条） */
supportRouter.get('/history/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const rows = db.prepare(
    'SELECT id, role, content, image_url, is_transfer_human, created_at FROM support_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, limit) as unknown[];
  res.json(rows.reverse());
});

/** 用户提交购买积分/会员申请 */
supportRouter.post('/requests', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const requestType = String(req.body?.request_type || 'points_or_membership').trim();
  const content = String(req.body?.content || '我想购买积分/开通会员，请联系我。').trim();
  if (requestType !== 'points_or_membership') {
    return res.status(400).json({ error: '无效的 request_type' });
  }
  const result = db.prepare(
    `INSERT INTO support_requests (user_id, request_type, content, status, updated_at)
     VALUES (?, ?, ?, 'pending', datetime('now'))`
  ).run(userId, requestType, content || null);
  const row = db.prepare('SELECT * FROM support_requests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

/** 用户查看自己的申请 */
supportRouter.get('/requests/my', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const rows = db.prepare(
    'SELECT * FROM support_requests WHERE user_id = ? ORDER BY id DESC LIMIT 50'
  ).all(userId);
  res.json(rows);
});

/** 客服审核员：查看申请列表 */
supportRouter.get('/requests/review', requireAuth, (req: AuthRequest, res) => {
  const reviewerId = req.user!.userId;
  if (!isSupportReviewer(reviewerId)) return res.status(403).json({ error: '无权限' });
  const status = String(req.query.status || 'pending').trim();
  const sql = status === 'all'
    ? `SELECT sr.*, u.phone AS user_phone
       FROM support_requests sr
       LEFT JOIN users u ON u.id = sr.user_id
       ORDER BY sr.id DESC`
    : `SELECT sr.*, u.phone AS user_phone
       FROM support_requests sr
       LEFT JOIN users u ON u.id = sr.user_id
       WHERE sr.status = ?
       ORDER BY sr.id DESC`;
  const rows = status === 'all' ? db.prepare(sql).all() : db.prepare(sql).all(status);
  res.json(rows);
});

/** 客服审核员：更新申请状态 */
supportRouter.put('/requests/:id', requireAuth, (req: AuthRequest, res) => {
  const reviewerId = req.user!.userId;
  if (!isSupportReviewer(reviewerId)) return res.status(403).json({ error: '无权限' });
  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  const note = String(req.body?.handle_note || '').trim();
  if (!['pending', 'contacted', 'completed', 'closed'].includes(status)) {
    return res.status(400).json({ error: '无效状态' });
  }
  const row = db.prepare('SELECT id FROM support_requests WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '申请不存在' });
  db.prepare(
    `UPDATE support_requests
     SET status = ?, handled_by = ?, handle_note = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, reviewerId, note || null, id);
  const updated = db.prepare('SELECT * FROM support_requests WHERE id = ?').get(id);
  res.json(updated);
});
