import path from 'path';
import fs from 'fs';
import { db } from '../db/init';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

/** 一次性/短期 token：token -> { filename, expiresAt }，供试衣服务拉图或前端展示 */
const accessTokenMap = new Map<string, { filename: string; expiresAt: number }>();
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 小时，用于前端展示
const TOKEN_TTL_TRYON_MS = 2 * 60 * 1000; // 2 分钟，供 tryon-service 拉图

function randomToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 生成访问 token，返回 token 字符串 */
export function createAccessToken(filename: string, ttlMs: number = TOKEN_TTL_MS): string {
  const token = randomToken();
  accessTokenMap.set(token, { filename, expiresAt: Date.now() + ttlMs });
  return token;
}

/** 校验 token：有效则返回 filename，否则 null */
export function consumeToken(token: string): string | null {
  const entry = accessTokenMap.get(token);
  if (!entry || Date.now() > entry.expiresAt) return null;
  accessTokenMap.delete(token);
  return entry.filename;
}

/** 仅校验 token 不删除（用于多次读图，如试衣服务可能多次请求同一 URL） */
export function peekToken(token: string): string | null {
  const entry = accessTokenMap.get(token);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.filename;
}

/** 检查该文件是否属于该用户（user_uploads 表） */
export function isOwnerOfUpload(userId: number, filename: string): boolean {
  const row = db.prepare('SELECT 1 FROM user_uploads WHERE user_id = ? AND filename = ?').get(userId, filename);
  return !!row;
}

/** 检查该文件是否被任一用户设为头像（头像不做隐私保护，可公开访问） */
export function isAvatarFile(filename: string): boolean {
  if (!filename || filename.includes('/') || filename.includes('..')) return false;
  const escaped = filename
    .replace(/!/g, '!!')
    .replace(/%/g, '!%')
    .replace(/_/g, '!_');
  const row = db.prepare(
    "SELECT 1 FROM users WHERE avatar_url IS NOT NULL AND avatar_url != '' AND (avatar_url = ? OR avatar_url LIKE ? ESCAPE '!')"
  ).get('/uploads/' + filename, '%/' + escaped);
  return !!row;
}

/** 从 URL 路径提取 filename（如 /uploads/photo_1.jpg -> photo_1.jpg） */
export function filenameFromPath(urlPath: string): string {
  const s = urlPath.startsWith('/uploads/') ? urlPath.slice('/uploads/'.length) : urlPath.replace(/^.*\//, '');
  return path.basename(s).replace(/\?.*$/, '');
}

/** 安全读取文件路径，禁止目录穿越；存在且为文件则返回绝对路径，否则 null */
export function resolveUploadFilePath(filename: string): string | null {
  const base = path.resolve(UPLOAD_DIR);
  const full = path.resolve(base, path.normalize(filename));
  if (!full.startsWith(base)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

/**
 * 将库内存储路径转为浏览器可展示的 URL（/uploads/ 需带短期 token，因未对 uploads 做静态直出）
 */
export function accessUrlForStoragePath(baseUrl: string, storagePath: string | null | undefined): string | null {
  if (!storagePath || !String(storagePath).trim()) return null;
  const s = String(storagePath).trim();
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  if (s.startsWith('/uploads/')) {
    const filename = filenameFromPath(s);
    const token = createAccessToken(filename, TOKEN_TTL_MS);
    return `${baseUrl}/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
  }
  if (s.startsWith('/')) return `${baseUrl}${s}`;
  return `${baseUrl}/${s}`;
}

export { UPLOAD_DIR, TOKEN_TTL_MS, TOKEN_TTL_TRYON_MS };
