"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_CONFIG = void 0;
exports.isValidTier = isValidTier;
exports.activateMembershipAfterPayment = activateMembershipAfterPayment;
exports.isMembershipActive = isMembershipActive;
exports.unlockOutfitWithMemberQuota = unlockOutfitWithMemberQuota;
const init_1 = require("../db/init");
const points_1 = require("./points");
exports.TIER_CONFIG = {
    monthly: { days: 30, quota: 5, amountCents: 1000, label: '月卡', bonusPoints: 20 },
    quarterly: { days: 90, quota: 15, amountCents: 3500, label: '季卡', bonusPoints: 80 },
    yearly: { days: 365, quota: 50, amountCents: 10000, label: '年卡', bonusPoints: 300 },
};
function isValidTier(tier) {
    return tier in exports.TIER_CONFIG;
}
/** 支付成功后：延长会员有效期并增加当期免费解锁次数 */
function activateMembershipAfterPayment(userId, tier) {
    const cfg = exports.TIER_CONFIG[tier];
    if (!cfg)
        return;
    const row = init_1.db
        .prepare('SELECT member_expires_at, member_free_unlocks_remaining FROM users WHERE id = ?')
        .get(userId);
    if (!row)
        return;
    const now = new Date();
    let base = now;
    if (row.member_expires_at) {
        const cur = new Date(row.member_expires_at);
        if (!Number.isNaN(cur.getTime()) && cur > base)
            base = cur;
    }
    const end = new Date(base);
    end.setDate(end.getDate() + cfg.days);
    const prevRemaining = Number(row.member_free_unlocks_remaining) || 0;
    const newRemaining = prevRemaining + cfg.quota;
    init_1.db.prepare(`UPDATE users SET is_member = 1, member_tier = ?, member_expires_at = ?, member_free_unlocks_remaining = ? WHERE id = ?`).run(tier, end.toISOString(), newRemaining, userId);
    if (cfg.bonusPoints > 0) {
        (0, points_1.addPoints)(userId, cfg.bonusPoints, {
            reason: `开通${cfg.label}奖励`,
            source: 'membership',
        });
    }
}
/** 会员是否在有效期内 */
function isMembershipActive(userId) {
    const row = init_1.db
        .prepare('SELECT is_member, member_expires_at FROM users WHERE id = ?')
        .get(userId);
    if (!row || row.is_member !== 1)
        return false;
    if (!row.member_expires_at)
        return true;
    const exp = new Date(row.member_expires_at);
    return !Number.isNaN(exp.getTime()) && exp > new Date();
}
/**
 * 使用会员免费解锁名额解锁一套：先写入解锁记录再扣减名额；
 * 若扣减失败（并发等）则删除刚插入的解锁记录，避免白扣名额或重复解锁。
 */
function unlockOutfitWithMemberQuota(userId, outfitId) {
    if (!isMembershipActive(userId))
        return false;
    const row = init_1.db
        .prepare('SELECT member_free_unlocks_remaining FROM users WHERE id = ?')
        .get(userId);
    const n = Number(row?.member_free_unlocks_remaining) || 0;
    if (n <= 0)
        return false;
    const ins = init_1.db.prepare('INSERT INTO user_unlocks (user_id, outfit_id) VALUES (?, ?)').run(userId, outfitId);
    if (ins.changes === 0)
        return false;
    const dec = init_1.db
        .prepare('UPDATE users SET member_free_unlocks_remaining = member_free_unlocks_remaining - 1 WHERE id = ? AND member_free_unlocks_remaining > 0')
        .run(userId);
    if (dec.changes === 0) {
        init_1.db.prepare('DELETE FROM user_unlocks WHERE user_id = ? AND outfit_id = ?').run(userId, outfitId);
        return false;
    }
    return true;
}
