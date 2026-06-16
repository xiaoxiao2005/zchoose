"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_TTL_TRYON_MS = exports.TOKEN_TTL_MS = exports.UPLOAD_DIR = void 0;
exports.createAccessToken = createAccessToken;
exports.consumeToken = consumeToken;
exports.peekToken = peekToken;
exports.isOwnerOfUpload = isOwnerOfUpload;
exports.isAvatarFile = isAvatarFile;
exports.filenameFromPath = filenameFromPath;
exports.resolveUploadFilePath = resolveUploadFilePath;
exports.accessUrlForStoragePath = accessUrlForStoragePath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const init_1 = require("../db/init");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path_1.default.join(__dirname, '../../uploads');
exports.UPLOAD_DIR = UPLOAD_DIR;
/** 一次性/短期 token：token -> { filename, expiresAt }，供试衣服务拉图或前端展示 */
const accessTokenMap = new Map();
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 小时，用于前端展示
exports.TOKEN_TTL_MS = TOKEN_TTL_MS;
const TOKEN_TTL_TRYON_MS = 2 * 60 * 1000; // 2 分钟，供 tryon-service 拉图
exports.TOKEN_TTL_TRYON_MS = TOKEN_TTL_TRYON_MS;
function randomToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
/** 生成访问 token，返回 token 字符串 */
function createAccessToken(filename, ttlMs = TOKEN_TTL_MS) {
    const token = randomToken();
    accessTokenMap.set(token, { filename, expiresAt: Date.now() + ttlMs });
    return token;
}
/** 校验 token：有效则返回 filename，否则 null */
function consumeToken(token) {
    const entry = accessTokenMap.get(token);
    if (!entry || Date.now() > entry.expiresAt)
        return null;
    accessTokenMap.delete(token);
    return entry.filename;
}
/** 仅校验 token 不删除（用于多次读图，如试衣服务可能多次请求同一 URL） */
function peekToken(token) {
    const entry = accessTokenMap.get(token);
    if (!entry || Date.now() > entry.expiresAt)
        return null;
    return entry.filename;
}
/** 检查该文件是否属于该用户（user_uploads 表） */
function isOwnerOfUpload(userId, filename) {
    const row = init_1.db.prepare('SELECT 1 FROM user_uploads WHERE user_id = ? AND filename = ?').get(userId, filename);
    return !!row;
}
/** 检查该文件是否被任一用户设为头像（头像不做隐私保护，可公开访问） */
function isAvatarFile(filename) {
    if (!filename || filename.includes('/') || filename.includes('..'))
        return false;
    const escaped = filename
        .replace(/!/g, '!!')
        .replace(/%/g, '!%')
        .replace(/_/g, '!_');
    const row = init_1.db.prepare("SELECT 1 FROM users WHERE avatar_url IS NOT NULL AND avatar_url != '' AND (avatar_url = ? OR avatar_url LIKE ? ESCAPE '!')").get('/uploads/' + filename, '%/' + escaped);
    return !!row;
}
/** 从 URL 路径提取 filename（如 /uploads/photo_1.jpg -> photo_1.jpg） */
function filenameFromPath(urlPath) {
    const s = urlPath.startsWith('/uploads/') ? urlPath.slice('/uploads/'.length) : urlPath.replace(/^.*\//, '');
    return path_1.default.basename(s).replace(/\?.*$/, '');
}
/** 安全读取文件路径，禁止目录穿越；存在且为文件则返回绝对路径，否则 null */
function resolveUploadFilePath(filename) {
    const base = path_1.default.resolve(UPLOAD_DIR);
    const full = path_1.default.resolve(base, path_1.default.normalize(filename));
    if (!full.startsWith(base))
        return null;
    if (!fs_1.default.existsSync(full) || !fs_1.default.statSync(full).isFile())
        return null;
    return full;
}
/**
 * 将库内存储路径转为浏览器可展示的 URL（/uploads/ 需带短期 token，因未对 uploads 做静态直出）
 */
function accessUrlForStoragePath(baseUrl, storagePath) {
    if (!storagePath || !String(storagePath).trim())
        return null;
    const s = String(storagePath).trim();
    if (s.startsWith('http') || s.startsWith('data:'))
        return s;
    if (s.startsWith('/uploads/')) {
        const filename = filenameFromPath(s);
        const token = createAccessToken(filename, TOKEN_TTL_MS);
        return `${baseUrl}/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
    }
    if (s.startsWith('/'))
        return `${baseUrl}${s}`;
    return `${baseUrl}/${s}`;
}
