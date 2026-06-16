"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOutfitsRouter = void 0;
const express_1 = require("express");
const init_1 = require("../db/init");
const outfitImageTagger_1 = require("../services/outfitImageTagger");
const auth_1 = require("../middleware/auth");
exports.adminOutfitsRouter = (0, express_1.Router)();
function requireAdminSecret(req, res, next) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
        return res.status(501).json({ error: '未配置 ADMIN_SECRET，无法使用人工校正台' });
    }
    const fromHeader = req.headers['x-admin-secret'];
    const fromQuery = typeof req.query.adminSecret === 'string' ? req.query.adminSecret : undefined;
    const body = req.body;
    const fromBody = body && typeof body.adminSecret === 'string' ? body.adminSecret : undefined;
    const provided = (typeof fromHeader === 'string' ? fromHeader : undefined) || fromQuery || fromBody;
    if (provided !== secret) {
        return res.status(403).json({ error: '密钥错误' });
    }
    next();
}
/** 先登录（JWT），再校验 ADMIN_SECRET */
exports.adminOutfitsRouter.use(auth_1.requireAuth);
exports.adminOutfitsRouter.use(requireAdminSecret);
function buildWhere(q, pathPrefix) {
    const parts = [];
    const params = [];
    if (q != null && String(q).trim() !== '') {
        const p = `%${String(q).trim()}%`;
        parts.push('(name LIKE ? OR COALESCE(style_tags, \'\') LIKE ?)');
        params.push(p, p);
    }
    if (pathPrefix != null && String(pathPrefix).trim() !== '') {
        parts.push('COALESCE(image_url, \'\') LIKE ?');
        params.push(`%${String(pathPrefix).trim()}%`);
    }
    if (parts.length === 0)
        return { sql: '1=1', params: [] };
    return { sql: parts.join(' AND '), params };
}
/**
 * GET /api/admin/outfits
 * Query: page (默认 1), pageSize (默认 24, 最大 100), q（名称或标签子串）, path（image_url 子串，便于按目录筛）, sort=id_asc|id_desc|created_desc
 */
exports.adminOutfitsRouter.get('/', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const rawSize = Number(req.query.pageSize);
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 24));
    const q = req.query.q;
    const pathPrefix = req.query.path;
    const sort = req.query.sort || 'id_asc';
    let orderBy = 'id ASC';
    if (sort === 'id_desc')
        orderBy = 'id DESC';
    else if (sort === 'created_desc')
        orderBy = 'created_at DESC';
    const { sql: whereSql, params: whereParams } = buildWhere(q, pathPrefix);
    const countRow = init_1.db.prepare(`SELECT COUNT(*) AS c FROM outfits WHERE ${whereSql}`).get(...whereParams);
    const total = Number(countRow?.c ?? 0);
    const offset = (page - 1) * pageSize;
    const rows = init_1.db
        .prepare(`SELECT id, name, image_url, style_tags, need_points, created_at FROM outfits WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
        .all(...whereParams, pageSize, offset);
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
exports.adminOutfitsRouter.patch('/batch', (req, res) => {
    const { ids, style_tags } = req.body;
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
    const tags = raw === '' ? null : (0, outfitImageTagger_1.sanitizeStyleTagsString)(raw);
    const placeholders = idList.map(() => '?').join(',');
    const stmt = init_1.db.prepare(`UPDATE outfits SET style_tags = ? WHERE id IN (${placeholders})`);
    stmt.run(tags, ...idList);
    res.json({ ok: true, updated: idList.length });
});
/**
 * PATCH /api/admin/outfits/:id
 * Body: { style_tags?: string, name?: string } — 至少一项；style_tags 会经 sanitize
 */
exports.adminOutfitsRouter.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: '无效的 id' });
    }
    const { style_tags, name } = req.body;
    if (style_tags === undefined && name === undefined) {
        return res.status(400).json({ error: '请提供 style_tags 或 name' });
    }
    const cur = init_1.db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
    if (!cur)
        return res.status(404).json({ error: '搭配不存在' });
    const n = name !== undefined ? String(name).trim() : cur.name;
    let tags = cur.style_tags;
    if (style_tags !== undefined) {
        const raw = String(style_tags).trim();
        tags = raw === '' ? null : (0, outfitImageTagger_1.sanitizeStyleTagsString)(raw);
    }
    init_1.db.prepare('UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?').run(n, tags, id);
    const updated = init_1.db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
    res.json(updated);
});
