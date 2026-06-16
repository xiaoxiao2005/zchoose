import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/init';
import { sanitizeStyleTagsString } from '../services/outfitImageTagger';
import { requireAuth } from '../middleware/auth';

export const adminOutfitsRouter = Router();

function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(501).json({ error: '未配置 ADMIN_SECRET，无法使用人工校正台' });
  }
  const fromHeader = req.headers['x-admin-secret'];
  const fromQuery = typeof req.query.adminSecret === 'string' ? req.query.adminSecret : undefined;
  const body = req.body as { adminSecret?: string } | undefined;
  const fromBody = body && typeof body.adminSecret === 'string' ? body.adminSecret : undefined;
  const provided =
    (typeof fromHeader === 'string' ? fromHeader : undefined) || fromQuery || fromBody;
  if (provided !== secret) {
    return res.status(403).json({ error: '密钥错误' });
  }
  next();
}

/** 先登录（JWT），再校验 ADMIN_SECRET */
adminOutfitsRouter.use(requireAuth);
adminOutfitsRouter.use(requireAdminSecret);

type OutfitRow = {
  id: number;
  name: string;
  image_url: string | null;
  style_tags: string | null;
  need_points: number;
  created_at?: string | null;
};

function buildWhere(q?: string, pathPrefix?: string): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (q != null && String(q).trim() !== '') {
    const p = `%${String(q).trim()}%`;
    parts.push('(name LIKE ? OR COALESCE(style_tags, \'\') LIKE ?)');
    params.push(p, p);
  }
  if (pathPrefix != null && String(pathPrefix).trim() !== '') {
    parts.push('COALESCE(image_url, \'\') LIKE ?');
    params.push(`%${String(pathPrefix).trim()}%`);
  }
  if (parts.length === 0) return { sql: '1=1', params: [] };
  return { sql: parts.join(' AND '), params };
}

/**
 * GET /api/admin/outfits
 * Query: page (默认 1), pageSize (默认 24, 最大 100), q（名称或标签子串）, path（image_url 子串，便于按目录筛）, sort=id_asc|id_desc|created_desc
 */
adminOutfitsRouter.get('/', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const rawSize = Number(req.query.pageSize);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 24));
  const q = req.query.q as string | undefined;
  const pathPrefix = req.query.path as string | undefined;
  const sort = (req.query.sort as string) || 'id_asc';

  let orderBy = 'id ASC';
  if (sort === 'id_desc') orderBy = 'id DESC';
  else if (sort === 'created_desc') orderBy = 'created_at DESC';

  const { sql: whereSql, params: whereParams } = buildWhere(q, pathPrefix);

  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM outfits WHERE ${whereSql}`).get(...whereParams) as
    | { c: number | bigint }
    | undefined;
  const total = Number(countRow?.c ?? 0);

  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT id, name, image_url, style_tags, need_points, created_at FROM outfits WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...whereParams, pageSize, offset) as OutfitRow[];

  res.json({
    items: rows,
    total,
    page,
    pageSize,
  });
});

/**
 * PATCH /api/admin/outfits/batch
 * Body: { ids: number[], style_tags: string } — 将多套搭配的标签统一设为同一串（覆盖）
 * 须注册在 /:id 之前，否则 batch 会被当成 id。
 */
adminOutfitsRouter.patch('/batch', (req, res) => {
  const { ids, style_tags } = req.body as { ids?: unknown; style_tags?: string };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供非空 ids 数组' });
  }
  const idList = ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
  if (idList.length === 0) {
    return res.status(400).json({ error: 'ids 无效' });
  }
  if (style_tags === undefined) {
    return res.status(400).json({ error: '请提供 style_tags' });
  }
  const raw = String(style_tags).trim();
  const tags = raw === '' ? null : sanitizeStyleTagsString(raw);
  const placeholders = idList.map(() => '?').join(',');
  const stmt = db.prepare(`UPDATE outfits SET style_tags = ? WHERE id IN (${placeholders})`);
  stmt.run(tags, ...idList);
  res.json({ ok: true, updated: idList.length });
});

/**
 * PATCH /api/admin/outfits/:id
 * Body: { style_tags?: string, name?: string } — 至少一项；style_tags 会经 sanitize
 */
adminOutfitsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '无效的 id' });
  }
  const { style_tags, name } = req.body as { style_tags?: string; name?: string };
  if (style_tags === undefined && name === undefined) {
    return res.status(400).json({ error: '请提供 style_tags 或 name' });
  }
  const cur = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id) as OutfitRow | undefined;
  if (!cur) return res.status(404).json({ error: '搭配不存在' });

  const n = name !== undefined ? String(name).trim() : cur.name;
  let tags = cur.style_tags;
  if (style_tags !== undefined) {
    const raw = String(style_tags).trim();
    tags = raw === '' ? null : sanitizeStyleTagsString(raw);
  }
  db.prepare('UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?').run(n, tags, id);
  const updated = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
  res.json(updated);
});
