"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserPoints = ensureUserPoints;
exports.getPoints = getPoints;
exports.addPoints = addPoints;
exports.deductPoints = deductPoints;
exports.listRecentPointLogs = listRecentPointLogs;
const init_1 = require("../db/init");
const INITIAL_POINTS = 50;
function logPointChange(userId, changeAmount, meta) {
    if (!Number.isFinite(changeAmount) || changeAmount === 0)
        return;
    init_1.db.prepare('INSERT INTO user_points_ledger (user_id, change_amount, reason, source, ref_id) VALUES (?, ?, ?, ?, ?)').run(userId, changeAmount, meta?.reason ?? null, meta?.source ?? 'other', meta?.refId ?? null);
}
/** 确保用户有积分记录；新用户或已有记录但为 0 的均设为初始 50 积分 */
function ensureUserPoints(userId) {
    const row = init_1.db.prepare('SELECT user_id, points FROM user_points WHERE user_id = ?').get(userId);
    if (!row) {
        init_1.db.prepare('INSERT INTO user_points (user_id, points, updated_at) VALUES (?, ?, datetime("now"))').run(userId, INITIAL_POINTS);
        logPointChange(userId, INITIAL_POINTS, { reason: '新用户初始积分', source: 'init' });
        return;
    }
    if (row.points === 0) {
        init_1.db.prepare('UPDATE user_points SET points = ?, updated_at = datetime("now") WHERE user_id = ?').run(INITIAL_POINTS, userId);
        logPointChange(userId, INITIAL_POINTS, { reason: '积分初始化补发', source: 'init' });
    }
}
/** 查询当前积分 */
function getPoints(userId) {
    ensureUserPoints(userId);
    const row = init_1.db.prepare('SELECT points FROM user_points WHERE user_id = ?').get(userId);
    return row?.points ?? INITIAL_POINTS;
}
/** 增加积分（delta 为正）；返回变更后的积分，不足时返回 -1 不扣减 */
function addPoints(userId, delta, meta) {
    ensureUserPoints(userId);
    if (delta <= 0)
        return getPoints(userId);
    init_1.db.prepare('UPDATE user_points SET points = points + ?, updated_at = datetime("now") WHERE user_id = ?').run(delta, userId);
    logPointChange(userId, delta, meta);
    return getPoints(userId);
}
/** 扣减积分（delta 为正）；成功返回变更后积分，不足时返回 -1 且不扣减 */
function deductPoints(userId, delta, meta) {
    ensureUserPoints(userId);
    if (delta <= 0)
        return getPoints(userId);
    const cur = getPoints(userId);
    if (cur < delta)
        return -1;
    init_1.db.prepare('UPDATE user_points SET points = points - ?, updated_at = datetime("now") WHERE user_id = ?').run(delta, userId);
    logPointChange(userId, -delta, meta);
    return cur - delta;
}
function listRecentPointLogs(userId, limit = 20) {
    ensureUserPoints(userId);
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    return init_1.db.prepare('SELECT id, change_amount, reason, source, ref_id, created_at FROM user_points_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, safeLimit);
}
