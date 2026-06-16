"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLogin = recordLogin;
exports.getStreak = getStreak;
const init_1 = require("../db/init");
const energy_1 = require("./energy");
function todayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function ensureStreak(userId) {
    const row = init_1.db.prepare('SELECT user_id FROM user_login_streak WHERE user_id = ?').get(userId);
    if (!row) {
        init_1.db.prepare('INSERT INTO user_login_streak (user_id, streak_days, last_login_date, updated_at) VALUES (?, 0, NULL, datetime("now"))').run(userId);
    }
}
/** 记录本次登录，更新累计登录天数并发放当日时尚能量（仅当日首次登录生效） */
function recordLogin(userId) {
    ensureStreak(userId);
    const today = todayStr();
    const row = init_1.db.prepare('SELECT streak_days, last_login_date FROM user_login_streak WHERE user_id = ?').get(userId);
    const last = row?.last_login_date ?? null;
    let streakDays = row?.streak_days ?? 0;
    if (last === today) {
        return { streakDays, energyAdded: 0 };
    }
    // 产品语义为“已登录 X 天（累计）”，不要求连续，非同一天首次登录即 +1
    streakDays = Math.max(0, streakDays) + 1;
    init_1.db.prepare('UPDATE user_login_streak SET streak_days = ?, last_login_date = ?, updated_at = datetime("now") WHERE user_id = ?').run(streakDays, today, userId);
    // 已登录即加：每次当日首次登录加固定时尚能量，不再按“连续登录”加成
    const energyAdded = 30;
    (0, energy_1.addEnergy)(userId, energyAdded);
    return { streakDays, energyAdded };
}
function getStreak(userId) {
    ensureStreak(userId);
    const row = init_1.db.prepare('SELECT streak_days FROM user_login_streak WHERE user_id = ?').get(userId);
    return row?.streak_days ?? 0;
}
