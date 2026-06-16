import { Router } from 'express';
import { getPoints, listRecentPointLogs } from '../services/points';
import { getEnergy } from '../services/energy';
import { getStreak } from '../services/loginStreak';
import { getDailyQuotaSummary } from '../services/dailyQuota';

export const incentivesRouter = Router();

/** 获取用户激励机制数据：积分、时尚能量、累计登录天数、当日试衣/下载额度 */
incentivesRouter.get('/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '无效的 userId' });
  }
  const points = getPoints(userId);
  const recentPointLogs = listRecentPointLogs(userId, 20);
  const energy = getEnergy(userId);
  const streakDays = getStreak(userId);
  let dailyQuota: ReturnType<typeof getDailyQuotaSummary> | undefined;
  try {
    dailyQuota = getDailyQuotaSummary(userId);
  } catch (_) {
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
