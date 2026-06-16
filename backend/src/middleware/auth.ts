import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'dev-secret';

export interface JwtPayload {
  userId: number;
  phone?: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * 校验 Authorization: Bearer <token>，将 userId 写入 req.user
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期或无效，请重新登录' });
  }
}

/**
 * 若带 token 则解析并写入 req.user，不强制登录
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(auth.slice(7), secret) as JwtPayload;
    } catch {
      // 忽略无效 token
    }
  }
  next();
}
