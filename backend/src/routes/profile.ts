import { Router } from 'express';
import { db } from '../db/init';
import { accessUrlForStoragePath } from '../services/uploadAccess';

export const profileRouter = Router();

const RECENT_IMAGE_LIMIT = 24;

/**
 * 用户穿搭画像：按历史穿搭记录统计场合分布、风格标签，返回摘要
 * - 官方搭配：仅统计仍存在于 outfits 的记录（下架/删除后不计入画像）
 * - 我的衣库试穿：仅写入 tryon_results，原先未进入 outfit_records，此处合并计入
 * - recentItems：带可展示 imageUrl（/uploads/ 已换为带 token 的访问地址）
 */
profileRouter.get('/:userId/style', (req, res) => {
  const userId = Number(req.params.userId);
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const rows = db.prepare(
    `SELECT occasion, weather_desc, style_tags, name, image_ref, source, ts FROM (
       SELECT r.occasion AS occasion,
              r.weather_desc AS weather_desc,
              COALESCE(o.style_tags, '') AS style_tags,
              COALESCE(o.name, '已下架搭配') AS name,
              COALESCE(o.image_url, '') AS image_ref,
              'outfit' AS source,
              r.created_at AS ts
       FROM outfit_records r
       INNER JOIN outfits o ON r.outfit_id = o.id
       WHERE r.user_id = ?
       UNION ALL
       SELECT NULL AS occasion,
              NULL AS weather_desc,
              '我的衣库' AS style_tags,
              COALESCE(w.name, '我的衣物') AS name,
              COALESCE(
                NULLIF(TRIM(COALESCE(t.front_url, '')), ''),
                NULLIF(TRIM(COALESCE(t.side_url, '')), ''),
                NULLIF(TRIM(COALESCE(t.back_url, '')), ''),
                NULLIF(TRIM(COALESCE(w.image_url, '')), ''),
                ''
              ) AS image_ref,
              'wardrobe' AS source,
              t.created_at AS ts
       FROM tryon_results t
       INNER JOIN user_wardrobe_items w ON t.wardrobe_item_id = w.id AND w.user_id = t.user_id
       WHERE t.user_id = ? AND t.wardrobe_item_id IS NOT NULL
     )
     ORDER BY ts DESC`
  ).all(userId, userId) as {
    occasion: string | null;
    weather_desc: string | null;
    style_tags: string | null;
    name: string;
    image_ref: string;
    source: string;
    ts: string;
  }[];

  const occasionCount: Record<string, number> = {};
  const tagCount: Record<string, number> = {};
  for (const r of rows) {
    const occ = r.occasion || '未分类';
    occasionCount[occ] = (occasionCount[occ] || 0) + 1;
    const tags = (r.style_tags || '').split(/[,，、\s]+/).filter(Boolean);
    for (const t of tags) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }
  const total = rows.length;
  const occasionDistribution = Object.entries(occasionCount).map(([name, count]) => ({
    name,
    count,
    percent: total ? Math.round((count / total) * 100) : 0,
  }));
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const summary =
    total === 0
      ? '暂无穿搭记录，多试穿、多选推荐会生成你的风格画像哦～'
      : `根据你近期的 ${total} 次穿搭，你常选「${topTags[0]?.name ?? '休闲'}」风格，场合以 ${occasionDistribution.map((o) => o.name).join('、')} 为主。`;

  const recentItems = rows.slice(0, RECENT_IMAGE_LIMIT).map((r) => ({
    name: r.name,
    kind: r.source === 'wardrobe' ? ('wardrobe' as const) : ('outfit' as const),
    imageUrl: accessUrlForStoragePath(baseUrl, r.image_ref || null),
  }));

  res.json({
    totalRecords: total,
    occasionDistribution,
    topStyleTags: topTags,
    summary,
    recentItems,
  });
});
