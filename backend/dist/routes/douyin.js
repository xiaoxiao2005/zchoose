"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.douyinRouter = void 0;
const express_1 = require("express");
const init_1 = require("../db/init");
exports.douyinRouter = (0, express_1.Router)();
/** 用户提交抖音链接或截图（截图可为上传后的 URL），待核验点赞≥10 后解锁一套 */
exports.douyinRouter.post('/claim', (req, res) => {
    const { userId, link, imageUrl } = req.body;
    if (!userId)
        return res.status(400).json({ error: '需要 userId' });
    if (!link && !imageUrl)
        return res.status(400).json({ error: '请提供 link（抖音链接）或 imageUrl（截图）' });
    const result = init_1.db.prepare('INSERT INTO douyin_claims (user_id, link, image_url, status) VALUES (?, ?, ?, ?)').run(userId, link ?? null, imageUrl ?? null, 'pending');
    const row = init_1.db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
});
/** 用户查看自己的核销记录 */
exports.douyinRouter.get('/claims/my/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    const rows = init_1.db.prepare('SELECT * FROM douyin_claims WHERE user_id = ? ORDER BY id DESC').all(userId);
    res.json(rows);
});
/** 后台：核验通过，为用户解锁指定搭配（不扣积分）；后续可加鉴权 */
exports.douyinRouter.post('/claims/:id/approve', (req, res) => {
    const id = Number(req.params.id);
    const { outfitId } = req.body;
    if (!outfitId)
        return res.status(400).json({ error: '请提供 outfitId（通过后解锁的搭配）' });
    const claim = init_1.db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(id);
    if (!claim)
        return res.status(404).json({ error: '记录不存在' });
    if (claim.status !== 'pending')
        return res.status(400).json({ error: '该记录已处理' });
    const oid = Number(outfitId);
    const outfit = init_1.db.prepare('SELECT id FROM outfits WHERE id = ?').get(oid);
    if (!outfit)
        return res.status(404).json({ error: '搭配不存在' });
    init_1.db.prepare('UPDATE douyin_claims SET status = ?, outfit_id = ?, reviewed_at = datetime("now") WHERE id = ?').run('approved', oid, id);
    init_1.db.prepare('INSERT OR IGNORE INTO user_unlocks (user_id, outfit_id) VALUES (?, ?)').run(claim.user_id, oid);
    const updated = init_1.db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(id);
    res.json({ claim: updated, unlocked: true, outfitId: oid });
});
/** 后台：拒绝 */
exports.douyinRouter.post('/claims/:id/reject', (req, res) => {
    const id = Number(req.params.id);
    const claim = init_1.db.prepare('SELECT id, status FROM douyin_claims WHERE id = ?').get(id);
    if (!claim)
        return res.status(404).json({ error: '记录不存在' });
    if (claim.status !== 'pending')
        return res.status(400).json({ error: '该记录已处理' });
    init_1.db.prepare('UPDATE douyin_claims SET status = ?, reviewed_at = datetime("now") WHERE id = ?').run('rejected', id);
    const updated = init_1.db.prepare('SELECT * FROM douyin_claims WHERE id = ?').get(id);
    res.json(updated);
});
/** 后台：列表（待核验/全部），可选 ?status=pending */
exports.douyinRouter.get('/claims', (req, res) => {
    const status = req.query.status;
    const sql = status ? 'SELECT * FROM douyin_claims WHERE status = ? ORDER BY id DESC' : 'SELECT * FROM douyin_claims ORDER BY id DESC';
    const rows = status ? init_1.db.prepare(sql).all(status) : init_1.db.prepare(sql).all();
    res.json(rows);
});
