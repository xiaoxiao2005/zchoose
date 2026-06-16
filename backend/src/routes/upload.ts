import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/init';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import {
  createAccessToken,
  peekToken,
  isOwnerOfUpload,
  isAvatarFile,
  resolveUploadFilePath,
  TOKEN_TTL_MS,
  TOKEN_TTL_TRYON_MS,
  filenameFromPath,
} from '../services/uploadAccess';

export const UPLOAD_DIR_EXPORT = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

if (!fs.existsSync(UPLOAD_DIR_EXPORT)) {
  fs.mkdirSync(UPLOAD_DIR_EXPORT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR_EXPORT),
  filename: (_req, file, cb) => {
    const ext = (file.mimetype === 'image/png') ? '.png' : (file.mimetype === 'image/webp') ? '.webp' : (file.mimetype === 'image/gif') ? '.gif' : '.jpg';
    const name = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error('仅支持 JPG / PNG / WebP / GIF'));
    }
    cb(null, true);
  },
});

export const uploadRouter = Router();

// 单张头像/半身照上传，需登录；记录归属并返回带 token 的访问地址以保护隐私
uploadRouter.post('/photo', requireAuth, upload.single('photo'), (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择一张图片上传（字段名 photo）' });
  }
  const userId = req.user!.userId;
  const filename = req.file.filename;
  db.prepare('INSERT INTO user_uploads (user_id, filename) VALUES (?, ?)').run(userId, filename);
  const photo_url = '/uploads/' + filename;
  const token = createAccessToken(filename, TOKEN_TTL_MS);
  const photo_access_url = `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
  res.json({ photo_url, photo_access_url });
});

// 背景图上传，需登录；同样记录归属并返回带 token 的访问地址
uploadRouter.post('/background', requireAuth, upload.single('background'), (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择一张背景图上传（字段名 background）' });
  }
  const userId = req.user!.userId;
  const filename = req.file.filename;
  db.prepare('INSERT INTO user_uploads (user_id, filename) VALUES (?, ?)').run(userId, filename);
  const background_url = '/uploads/' + filename;
  const token = createAccessToken(filename, TOKEN_TTL_MS);
  const background_access_url = `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
  res.json({ background_url, background_access_url });
});

// 获取上传文件的访问 URL（带短期 token），用于前端 img 展示；需登录且为文件所有者或为本人资料头像
uploadRouter.post('/access-url', requireAuth, (req: AuthRequest, res: Response) => {
  const pathOrFilename = (req.body?.path ?? req.body?.filename ?? '').trim();
  if (!pathOrFilename) return res.status(400).json({ error: '请提供 path 或 filename' });
  const filename = filenameFromPath(pathOrFilename);
  const userId = req.user!.userId;
  const isOwner = isOwnerOfUpload(userId, filename);
  const isProfileAvatar = !isOwner && (() => {
    const row = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId) as { avatar_url: string | null } | undefined;
    const avatar = row?.avatar_url ?? '';
    return avatar && filenameFromPath(avatar) === filename;
  })();
  const allowed = isOwner || isProfileAvatar;
  if (!allowed) return res.status(403).json({ error: '无权访问该文件' });
  const token = createAccessToken(filename, TOKEN_TTL_MS);
  const url = `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
  res.json({ url });
});

// 头像公开访问：仅当该文件被某用户设为头像时可直接访问，无需 token（头像不做隐私保护）
uploadRouter.get('/avatar/:filename', (req, res) => {
  let filename: string;
  try {
    filename = decodeURIComponent(req.params.filename);
  } catch {
    return res.status(400).json({ error: '文件名格式无效' });
  }
  if (!filename || filename.includes('..') || !isAvatarFile(filename)) {
    return res.status(404).json({ error: '文件不存在或非头像' });
  }
  const filePath = resolveUploadFilePath(filename);
  if (!filePath) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: '读取文件失败' });
  });
});

// 访问上传文件（试衣用照片等）：带有效 token 或登录且为所有者时可查看
uploadRouter.get('/access/:filename', optionalAuth, (req, res) => {
  let filename: string;
  try {
    filename = decodeURIComponent(req.params.filename);
  } catch {
    return res.status(400).json({ error: '文件名格式无效' });
  }
  if (!filename || filename.includes('..')) {
    return res.status(400).json({ error: '文件名无效' });
  }
  const token = (req.query.token as string) ?? '';
  let allowed = false;
  if (token) {
    const resolved = peekToken(token);
    if (resolved === filename) allowed = true;
  }
  if (!allowed && (req as AuthRequest).user) {
    if (isOwnerOfUpload((req as AuthRequest).user!.userId, filename)) allowed = true;
  }
  if (!allowed) {
    return res.status(403).json({ error: '无权查看该文件' });
  }
  const filePath = resolveUploadFilePath(filename);
  if (!filePath) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: '读取文件失败' });
  });
});

/** 供试衣服务拉图：生成短期一次性 token，用于构建 personPhotoUrl */
export function createTryOnAccessToken(filename: string): string {
  return createAccessToken(filename, TOKEN_TTL_TRYON_MS);
}

