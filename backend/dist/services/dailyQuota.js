"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTryonUsedToday = getTryonUsedToday;
exports.getDownloadUsedToday = getDownloadUsedToday;
exports.getTryonRemainingToday = getTryonRemainingToday;
exports.getDownloadRemainingToday = getDownloadRemainingToday;
exports.consumeTryonQuota = consumeTryonQuota;
exports.consumeDownloadQuota = consumeDownloadQuota;
exports.getDailyQuotaSummary = getDailyQuotaSummary;
const init_1 = require("../db/init");
const TRYON_PER_DAY = 5;
const DOWNLOAD_PER_DAY = 5;
function todayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function ensureRow(userId) {
    const date = todayStr();
    const row = init_1.db.prepare('SELECT user_id FROM user_daily_quota WHERE user_id = ? AND quota_date = ?').get(userId, date);
    if (!row) {
        init_1.db.prepare('INSERT INTO user_daily_quota (user_id, quota_date, tryon_used, download_used) VALUES (?, ?, 0, 0)').run(userId, date);
    }
}
/** 当日已用试衣次数 */
function getTryonUsedToday(userId) {
    ensureRow(userId);
    const row = init_1.db.prepare('SELECT tryon_used FROM user_daily_quota WHERE user_id = ? AND quota_date = ?').get(userId, todayStr());
    return row?.tryon_used ?? 0;
}
/** 当日已用下载次数 */
function getDownloadUsedToday(userId) {
    ensureRow(userId);
    const row = init_1.db.prepare('SELECT download_used FROM user_daily_quota WHERE user_id = ? AND quota_date = ?').get(userId, todayStr());
    return row?.download_used ?? 0;
}
/** 当日剩余试衣次数（0～5） */
function getTryonRemainingToday(userId) {
    return Math.max(0, TRYON_PER_DAY - getTryonUsedToday(userId));
}
/** 当日剩余下载次数（0～5） */
function getDownloadRemainingToday(userId) {
    return Math.max(0, DOWNLOAD_PER_DAY - getDownloadUsedToday(userId));
}
/** 扣减一次试衣额度，成功返回 true，不足返回 false */
function consumeTryonQuota(userId) {
    ensureRow(userId);
    const used = getTryonUsedToday(userId);
    if (used >= TRYON_PER_DAY)
        return false;
    init_1.db.prepare('UPDATE user_daily_quota SET tryon_used = tryon_used + 1, updated_at = datetime("now") WHERE user_id = ? AND quota_date = ?').run(userId, todayStr());
    return true;
}
/** 扣减一次下载额度并返回是否成功；成功时调用方再发时尚能量 */
function consumeDownloadQuota(userId) {
    ensureRow(userId);
    const used = getDownloadUsedToday(userId);
    if (used >= DOWNLOAD_PER_DAY)
        return false;
    init_1.db.prepare('UPDATE user_daily_quota SET download_used = download_used + 1, updated_at = datetime("now") WHERE user_id = ? AND quota_date = ?').run(userId, todayStr());
    return true;
}
/** 当日额度摘要（供前端展示） */
function getDailyQuotaSummary(userId) {
    const tryonUsed = getTryonUsedToday(userId);
    const downloadUsed = getDownloadUsedToday(userId);
    return {
        tryonUsed,
        tryonLimit: TRYON_PER_DAY,
        tryonRemaining: Math.max(0, TRYON_PER_DAY - tryonUsed),
        downloadUsed,
        downloadLimit: DOWNLOAD_PER_DAY,
        downloadRemaining: Math.max(0, DOWNLOAD_PER_DAY - downloadUsed),
        dailyPoints: 50,
        pointsPerTryon: 10,
    };
}
