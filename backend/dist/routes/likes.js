"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.likesRouter = void 0;
exports.isLiked = isLiked;
const express_1 = require("express");
const init_1 = require("../db/init");
exports.likesRouter = (0, express_1.Router)();
/** 检查用户是否已喜欢某套搭配（供推荐等推断用户偏好） */
function isLiked(userId, outfitId) {
    const row = init_1.db.prepare('SELECT 1 FROM user_outfit_likes WHERE user_id = ? AND outfit_id = ?').get(userId, outfitId);
    return !!row;
}
/** 切换喜欢状态：已喜欢则取消，未喜欢则添加；返回当前是否喜欢 */
exports.likesRouter.post('/', (req, res) => {
    const { userId, outfitId } = req.body;
    if (!userId || outfitId == null)
        return res.status(400).json({ error: '需要 userId, outfitId' });
    const uid = Number(userId);
    const oid = Number(outfitId);
    const outfit = init_1.db.prepare('SELECT id FROM outfits WHERE id = ?').get(oid);
    if (!outfit)
        return res.status(404).json({ error: '搭配不存在' });
    const existing = init_1.db.prepare('SELECT 1 FROM user_outfit_likes WHERE user_id = ? AND outfit_id = ?').get(uid, oid);
    if (existing) {
        init_1.db.prepare('DELETE FROM user_outfit_likes WHERE user_id = ? AND outfit_id = ?').run(uid, oid);
        return res.json({ liked: false });
    }
    init_1.db.prepare('INSERT INTO user_outfit_likes (user_id, outfit_id) VALUES (?, ?)').run(uid, oid);
    res.json({ liked: true });
});
