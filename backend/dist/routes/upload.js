"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = exports.UPLOAD_DIR_EXPORT = void 0;
exports.createTryOnAccessToken = createTryOnAccessToken;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const uploadAccess_1 = require("../services/uploadAccess");
exports.UPLOAD_DIR_EXPORT = process.env.UPLOAD_DIR || path_1.default.join(__dirname, '../../uploads');
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
if (!fs_1.default.existsSync(exports.UPLOAD_DIR_EXPORT)) {
    fs_1.default.mkdirSync(exports.UPLOAD_DIR_EXPORT, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, exports.UPLOAD_DIR_EXPORT),
    filename: (_req, file, cb) => {
        const ext = (file.mimetype === 'image/png') ? '.png' : (file.mimetype === 'image/webp') ? '.webp' : (file.mimetype === 'image/gif') ? '.gif' : '.jpg';
        const name = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
        cb(null, name);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
            return cb(new Error('仅支持 JPG / PNG / WebP / GIF'));
        }
        cb(null, true);
    },
});
exports.uploadRouter = (0, express_1.Router)();
// 单张头像/半身照上传，需登录；记录归属并返回带 token 的访问地址以保护隐私
exports.uploadRouter.post('/photo', auth_1.requireAuth, upload.single('photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择一张图片上传（字段名 photo）' });
    }
    const userId = req.user.userId;
    const filename = req.file.filename;
    init_1.db.prepare('INSERT INTO user_uploads (user_id, filename) VALUES (?, ?)').run(userId, filename);
    const photo_url = '/uploads/' + filename;
    const token = (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_MS);
    const photo_access_url = `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
    res.json({ photo_url, photo_access_url });
});
// 背景图上传，需登录；同样记录归属并返回带 token 的访问地址
exports.uploadRouter.post('/background', auth_1.requireAuth, upload.single('background'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择一张背景图上传（字段名 background）' });
    }
    const userId = req.user.userId;
    const filename = req.file.filename;
    init_1.db.prepare('INSERT INTO user_uploads (user_id, filename) VALUES (?, ?)').run(userId, filename);
    const background_url = '/uploads/' + filename;
    const token = (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_MS);
    const background_access_url = `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
    res.json({ background_url, background_access_url });
});
// 获取上传文件的访问 URL（带短期 token），用于前端 img 展示；需登录且为文件所有者或为本人资料头像
exports.uploadRouter.post('/access-url', auth_1.requireAuth, (req, res) => {
    const pathOrFilename = (req.body?.path ?? req.body?.filename ?? '').trim();
    if (!pathOrFilename)
        return res.status(400).json({ error: '请提供 path 或 filename' });
    const filename = (0, uploadAccess_1.filenameFromPath)(pathOrFilename);
    const userId = req.user.userId;
    const isOwner = (0, uploadAccess_1.isOwnerOfUpload)(userId, filename);
    const isProfileAvatar = !isOwner && (() => {
        const row = init_1.db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId);
        const avatar = row?.avatar_url ?? '';
        return avatar && (0, uploadAccess_1.filenameFromPath)(avatar) === filename;
    })();
    const allowed = isOwner || isProfileAvatar;
    if (!allowed)
        return res.status(403).json({ error: '无权访问该文件' });
    const token = (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_MS);
    const url = `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
    res.json({ url });
});
// 头像公开访问：仅当该文件被某用户设为头像时可直接访问，无需 token（头像不做隐私保护）
exports.uploadRouter.get('/avatar/:filename', (req, res) => {
    let filename;
    try {
        filename = decodeURIComponent(req.params.filename);
    }
    catch {
        return res.status(400).json({ error: '文件名格式无效' });
    }
    if (!filename || filename.includes('..') || !(0, uploadAccess_1.isAvatarFile)(filename)) {
        return res.status(404).json({ error: '文件不存在或非头像' });
    }
    const filePath = (0, uploadAccess_1.resolveUploadFilePath)(filename);
    if (!filePath)
        return res.status(404).json({ error: '文件不存在' });
    res.sendFile(filePath, (err) => {
        if (err && !res.headersSent)
            res.status(500).json({ error: '读取文件失败' });
    });
});
// 访问上传文件（试衣用照片等）：带有效 token 或登录且为所有者时可查看
exports.uploadRouter.get('/access/:filename', auth_1.optionalAuth, (req, res) => {
    let filename;
    try {
        filename = decodeURIComponent(req.params.filename);
    }
    catch {
        return res.status(400).json({ error: '文件名格式无效' });
    }
    if (!filename || filename.includes('..')) {
        return res.status(400).json({ error: '文件名无效' });
    }
    const token = req.query.token ?? '';
    let allowed = false;
    if (token) {
        const resolved = (0, uploadAccess_1.peekToken)(token);
        if (resolved === filename)
            allowed = true;
    }
    if (!allowed && req.user) {
        if ((0, uploadAccess_1.isOwnerOfUpload)(req.user.userId, filename))
            allowed = true;
    }
    if (!allowed) {
        return res.status(403).json({ error: '无权查看该文件' });
    }
    const filePath = (0, uploadAccess_1.resolveUploadFilePath)(filename);
    if (!filePath)
        return res.status(404).json({ error: '文件不存在' });
    res.sendFile(filePath, (err) => {
        if (err && !res.headersSent)
            res.status(500).json({ error: '读取文件失败' });
    });
});
/** 供试衣服务拉图：生成短期一次性 token，用于构建 personPhotoUrl */
function createTryOnAccessToken(filename) {
    return (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_TRYON_MS);
}
