"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlocksRouter = void 0;
exports.isUnlocked = isUnlocked;
const express_1 = require("express");
const init_1 = require("../db/init");
const points_1 = require("../services/points");
const membership_1 = require("../services/membership");
exports.unlocksRouter = (0, express_1.Router)();
/** 检查用户是否已解锁某套搭配 */
function isUnlocked(userId, outfitId) {
    const row = init_1.db.prepare('SELECT 1 FROM user_unlocks WHERE user_id = ? AND outfit_id = ?').get(userId, outfitId);
    return !!row;
}
/** 使用积分解锁一套搭配 */
exports.unlocksRouter.post('/', (req, res) => {
    const { userId, outfitId } = req.body;
    if (!userId || !outfitId)
        return res.status(400).json({ error: '需要 userId, outfitId' });
    const uid = Number(userId);
    const oid = Number(outfitId);
    if (isUnlocked(uid, oid)) {
        return res.json({ unlocked: true, message: '已解锁过该搭配' });
    }
    const outfit = init_1.db.prepare('SELECT id, need_points FROM outfits WHERE id = ?').get(oid);
    if (!outfit)
        return res.status(404).json({ error: '搭配不存在' });
    if (outfit.need_points <= 0) {
        init_1.db.prepare('INSERT OR IGNORE INTO user_unlocks (user_id, outfit_id) VALUES (?, ?)').run(uid, oid);
        return res.json({ unlocked: true, pointsSpent: 0 });
    }
    // 会员在有效期内且仍有免费解锁次数：不扣积分
    if ((0, membership_1.unlockOutfitWithMemberQuota)(uid, oid)) {
        return res.json({ unlocked: true, pointsSpent: 0, via: 'member_free' });
    }
    const points = (0, points_1.deductPoints)(uid, outfit.need_points);
    if (points < 0) {
        return res.status(400).json({ error: '积分不足', need: outfit.need_points, current: (0, points_1.getPoints)(uid) });
    }
    init_1.db.prepare('INSERT INTO user_unlocks (user_id, outfit_id) VALUES (?, ?)').run(uid, oid);
    res.json({ unlocked: true, pointsSpent: outfit.need_points, pointsLeft: points });
});
