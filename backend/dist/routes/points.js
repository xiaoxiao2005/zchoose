"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointsRouter = void 0;
const express_1 = require("express");
const points_1 = require("../services/points");
exports.pointsRouter = (0, express_1.Router)();
/** 查询当前用户积分 */
exports.pointsRouter.get('/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    const points = (0, points_1.getPoints)(userId);
    res.json({ userId, points });
});
/** 后台：为某用户加积分（如投稿采纳后调用；后续可加鉴权） */
exports.pointsRouter.post('/:userId/add', (req, res) => {
    const userId = Number(req.params.userId);
    const { amount } = req.body;
    const delta = Number(amount);
    if (!Number.isInteger(delta) || delta <= 0) {
        return res.status(400).json({ error: '请提供正整数 amount' });
    }
    const points = (0, points_1.addPoints)(userId, delta, { reason: '后台加分', source: 'admin' });
    res.json({ userId, points, added: delta });
});
