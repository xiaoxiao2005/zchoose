"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wardrobeRouter = void 0;
const express_1 = require("express");
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const uploadAccess_1 = require("../services/uploadAccess");
exports.wardrobeRouter = (0, express_1.Router)();
// 我的衣库：列表（仅本人）；image_url 转为可展示的带 token 地址，否则 /uploads/ 无法被 img 直接加载
exports.wardrobeRouter.get('/my', auth_1.requireAuth, (req, res) => {
    const userId = req.user.userId;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const rows = init_1.db.prepare('SELECT id, user_id, name, image_url, created_at FROM user_wardrobe_items WHERE user_id = ? ORDER BY id DESC').all(userId);
    const mapped = rows.map((row) => {
        const signed = (0, uploadAccess_1.accessUrlForStoragePath)(baseUrl, row.image_url);
        return { ...row, image_url: signed ?? row.image_url };
    });
    res.json(mapped);
});
// 我的衣库：新增（上传图片后入库）
exports.wardrobeRouter.post('/', auth_1.requireAuth, (req, res) => {
    const userId = req.user.userId;
    const name = String(req.body?.name ?? '').trim();
    const imageUrl = String(req.body?.image_url ?? '').trim();
    if (!imageUrl)
        return res.status(400).json({ error: '请提供 image_url' });
    if (!imageUrl.startsWith('/uploads/')) {
        return res.status(400).json({ error: '仅支持上传后的衣物图片地址' });
    }
    const result = init_1.db.prepare('INSERT INTO user_wardrobe_items (user_id, name, image_url) VALUES (?, ?, ?)').run(userId, name || '我的衣物', imageUrl);
    const row = init_1.db.prepare('SELECT id, user_id, name, image_url, created_at FROM user_wardrobe_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
});
// 我的衣库：删除（仅本人）
exports.wardrobeRouter.delete('/:id', auth_1.requireAuth, (req, res) => {
    const userId = req.user.userId;
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ error: '无效 id' });
    const row = init_1.db.prepare('SELECT id FROM user_wardrobe_items WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row)
        return res.status(404).json({ error: '衣物不存在' });
    init_1.db.prepare('DELETE FROM user_wardrobe_items WHERE id = ? AND user_id = ?').run(id, userId);
    res.status(204).send();
});
