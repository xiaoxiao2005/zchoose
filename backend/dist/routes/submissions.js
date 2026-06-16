"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submissionsRouter = void 0;
const express_1 = require("express");
const init_1 = require("../db/init");
const points_1 = require("../services/points");
const uploadAccess_1 = require("../services/uploadAccess");
const auth_1 = require("../middleware/auth");
const POINTS_ON_ACCEPT = 10; // 投稿采纳奖励积分
exports.submissionsRouter = (0, express_1.Router)();
function isReviewer(userId) {
    const ids = (process.env.REVIEWER_USER_IDS || '')
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0);
    if (ids.includes(userId))
        return true;
    const phones = (process.env.REVIEWER_PHONES || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    if (phones.length === 0)
        return false;
    const user = init_1.db.prepare('SELECT phone FROM users WHERE id = ?').get(userId);
    return !!(user?.phone && phones.includes(user.phone));
}
/** 用户投稿：上传搭配图 + 描述，存为待审核 */
exports.submissionsRouter.post('/', (req, res) => {
    const { userId, image_url, description } = req.body;
    if (!userId)
        return res.status(400).json({ error: '需要 userId' });
    const result = init_1.db.prepare('INSERT INTO user_submissions (user_id, image_url, description, status) VALUES (?, ?, ?, ?)').run(userId, image_url ?? null, description ?? null, 'pending');
    const row = init_1.db.prepare('SELECT * FROM user_submissions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
});
/** 用户查看自己的投稿列表 */
exports.submissionsRouter.get('/my/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    const rows = init_1.db.prepare('SELECT * FROM user_submissions WHERE user_id = ? ORDER BY id DESC').all(userId);
    const list = rows.map((row) => {
        const imageUrl = row.image_url;
        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) {
            return row;
        }
        const filename = (0, uploadAccess_1.filenameFromPath)(imageUrl);
        const token = (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_MS);
        return {
            ...row,
            image_access_url: `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`,
        };
    });
    res.json(list);
});
/** 后台：采纳投稿，加积分并更新状态 */
exports.submissionsRouter.post('/:id/accept', auth_1.requireAuth, (req, res) => {
    const reviewerId = req.user?.userId;
    if (!reviewerId || !isReviewer(reviewerId))
        return res.status(403).json({ error: '无审核权限' });
    const id = Number(req.params.id);
    const row = init_1.db.prepare('SELECT * FROM user_submissions WHERE id = ?').get(id);
    if (!row)
        return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending')
        return res.status(400).json({ error: '该投稿已处理' });
    init_1.db.prepare('UPDATE user_submissions SET status = ?, reviewed_at = datetime("now") WHERE id = ?').run('accepted', id);
    const points = (0, points_1.addPoints)(row.user_id, POINTS_ON_ACCEPT, {
        reason: '投稿采纳奖励',
        source: 'submission',
        refId: id,
    });
    const updated = init_1.db.prepare('SELECT * FROM user_submissions WHERE id = ?').get(id);
    res.json({ submission: updated, pointsAdded: POINTS_ON_ACCEPT, userPoints: points });
});
/** 后台：拒绝投稿 */
exports.submissionsRouter.post('/:id/reject', auth_1.requireAuth, (req, res) => {
    const reviewerId = req.user?.userId;
    if (!reviewerId || !isReviewer(reviewerId))
        return res.status(403).json({ error: '无审核权限' });
    const id = Number(req.params.id);
    const row = init_1.db.prepare('SELECT id, status FROM user_submissions WHERE id = ?').get(id);
    if (!row)
        return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending')
        return res.status(400).json({ error: '该投稿已处理' });
    init_1.db.prepare('UPDATE user_submissions SET status = ?, reviewed_at = datetime("now") WHERE id = ?').run('rejected', id);
    const updated = init_1.db.prepare('SELECT * FROM user_submissions WHERE id = ?').get(id);
    res.json(updated);
});
/** 审核员查看投稿列表 */
exports.submissionsRouter.get('/review/list', auth_1.requireAuth, (req, res) => {
    const reviewerId = req.user?.userId;
    if (!reviewerId || !isReviewer(reviewerId))
        return res.status(403).json({ error: '无审核权限' });
    const status = String(req.query.status || 'pending').trim();
    const sql = status === 'all'
        ? 'SELECT * FROM user_submissions ORDER BY id DESC'
        : 'SELECT * FROM user_submissions WHERE status = ? ORDER BY id DESC';
    const rows = (status === 'all'
        ? init_1.db.prepare(sql).all()
        : init_1.db.prepare(sql).all(status));
    const list = rows.map((row) => {
        const imageUrl = row.image_url;
        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/'))
            return row;
        const filename = (0, uploadAccess_1.filenameFromPath)(imageUrl);
        const token = (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_MS);
        return {
            ...row,
            image_access_url: `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`,
        };
    });
    res.json(list);
});
