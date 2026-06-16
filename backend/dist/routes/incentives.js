"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incentivesRouter = void 0;
const express_1 = require("express");
const points_1 = require("../services/points");
const energy_1 = require("../services/energy");
const loginStreak_1 = require("../services/loginStreak");
const dailyQuota_1 = require("../services/dailyQuota");
exports.incentivesRouter = (0, express_1.Router)();
/** 获取用户激励机制数据：积分、时尚能量、累计登录天数、当日试衣/下载额度 */
exports.incentivesRouter.get('/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: '无效的 userId' });
    }
    const points = (0, points_1.getPoints)(userId);
    const recentPointLogs = (0, points_1.listRecentPointLogs)(userId, 20);
    const energy = (0, energy_1.getEnergy)(userId);
    const streakDays = (0, loginStreak_1.getStreak)(userId);
    let dailyQuota;
    try {
        dailyQuota = (0, dailyQuota_1.getDailyQuotaSummary)(userId);
    }
    catch (_) {
        // 表未创建或异常时不阻塞，仅不返回 dailyQuota
    }
    res.json({
        userId,
        points: Number(points) || 0,
        recentPointLogs,
        energy: Number(energy) || 0,
        streakDays: Number(streakDays) || 0,
        dailyQuota,
    });
});
