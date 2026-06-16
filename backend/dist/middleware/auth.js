"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const secret = process.env.JWT_SECRET || 'dev-secret';
/**
 * 校验 Authorization: Bearer <token>，将 userId 写入 req.user
 */
function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        res.status(401).json({ error: '请先登录' });
        return;
    }
    const token = auth.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.user = payload;
        next();
    }
    catch {
        res.status(401).json({ error: '登录已过期或无效，请重新登录' });
    }
}
/**
 * 若带 token 则解析并写入 req.user，不强制登录
 */
function optionalAuth(req, _res, next) {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
        try {
            req.user = jsonwebtoken_1.default.verify(auth.slice(7), secret);
        }
        catch {
            // 忽略无效 token
        }
    }
    next();
}
