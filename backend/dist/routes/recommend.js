"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendRouter = void 0;
const express_1 = require("express");
const init_1 = require("../db/init");
const weather_1 = require("../services/weather");
const outfitRecords_1 = require("../services/outfitRecords");
const unlocks_1 = require("./unlocks");
const uploadAccess_1 = require("../services/uploadAccess");
const recommendWeather_1 = require("../config/recommendWeather");
exports.recommendRouter = (0, express_1.Router)();
/** 默认不拉外网天气，避免首页 /api/recommend 阻塞导致前端 20s 超时；设为 1 则调用 getWeather（仍建议配和风/key） */
const RECOMMEND_LIVE_WEATHER = process.env.RECOMMEND_LIVE_WEATHER === '1' || process.env.RECOMMEND_LIVE_WEATHER === 'true';
/** 默认关闭「按标签天气重排」；设为 1 与 RECOMMEND_LIVE_WEATHER 联用才有意义 */
const RECOMMEND_WEATHER_SCORE = process.env.RECOMMEND_WEATHER_SCORE === '1' || process.env.RECOMMEND_WEATHER_SCORE === 'true';
/**
 * 单次推荐里等待「真实天气」的最长时间（毫秒）。和风为两步请求，每步最多约 WEATHER_FETCH_TIMEOUT_MS；
 * 过短会常退回占位天气；建议 ≥18000。可用环境变量覆盖。
 */
const RECOMMEND_WEATHER_BUDGET_MS = Math.max(4000, Number(process.env.RECOMMEND_WEATHER_BUDGET_MS) || 20000);
function mockWeatherForRecommend(city) {
    const c = (city || '北京').trim() || '北京';
    return { temp: 22, desc: '晴', city: c };
}
// 首页推荐短缓存（仅官方衣库结果）：降低重复筛选与随机排序开销
const RECOMMEND_CACHE_TTL_MS = 60 * 1000;
const recommendCache = new Map();
/** 快速穿搭场合与衣库「风格」标签一致：只认这几种，筛选时 style_tags 须包含所选场合 */
const VALID_OCCASIONS = ['日常', '通勤', '约会', '运动', '过年'];
function isValidOccasion(s) {
    return VALID_OCCASIONS.includes(s);
}
/** 根据当前月份返回季节（北半球）：春 3-5，夏 6-8，秋 9-11，冬 12-2 */
function getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5)
        return '春';
    if (month >= 6 && month <= 8)
        return '夏';
    if (month >= 9 && month <= 11)
        return '秋';
    return '冬';
}
/** 根据天气、季节、场合及用户性别/年龄生成今日穿搭文字建议 */
function buildSuggestion(temp, desc, city, season, occasion, preferredGender, preferredAge) {
    let part = '';
    if (temp >= 28)
        part = '今日气温较高，适合短袖、短裤等清凉穿搭，注意防晒。';
    else if (temp >= 22)
        part = '今日气温适宜，适合轻薄长袖或薄外套，出行舒适。';
    else if (temp >= 17)
        part = '今日微凉，建议加件薄外套或长袖，早晚注意保暖。';
    else if (temp >= 10)
        part = '今日较凉，推荐长袖、薄毛衣或风衣，注意保暖。';
    else
        part = '今日较冷，建议厚外套、毛衣或羽绒，注意防寒。';
    let tail = '为您推荐以下穿搭。';
    const parts = [`场合「${occasion}」`, `当前${season}季`];
    if (preferredGender || preferredAge) {
        parts.push([preferredGender, preferredAge].filter(Boolean).join(' · '));
    }
    if (parts.length > 0) {
        tail = `已按${parts.join('、')}从衣库筛选，${tail}`;
    }
    else {
        tail = `结合当前${season}季，${tail}`;
    }
    return `今日 ${city} ${temp}°C，${desc}。${part} ${tail}`;
}
function buildWardrobeRecommendRows(userId, limit, baseUrl) {
    const wardrobeRows = init_1.db.prepare('SELECT id, name, image_url FROM user_wardrobe_items WHERE user_id = ? ORDER BY RANDOM() LIMIT ?').all(userId, limit);
    return wardrobeRows.map((w) => {
        let imageUrl = w.image_url;
        if (imageUrl.startsWith('/uploads/')) {
            const filename = (0, uploadAccess_1.filenameFromPath)(imageUrl);
            const token = (0, uploadAccess_1.createAccessToken)(filename, uploadAccess_1.TOKEN_TTL_MS);
            imageUrl = `${baseUrl}/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
        }
        return {
            id: w.id,
            wardrobe_item_id: w.id,
            name: w.name || `我的衣物-${w.id}`,
            image_url: imageUrl,
            style_tags: '我的衣库',
            source: 'wardrobe',
            unlocked: true,
        };
    });
}
function ageCandidatesFromProfile(preferredAge) {
    if (!preferredAge)
        return [];
    // 兼容两套年龄标签：
    // 1) 旧标签：少年/青年/中年/老年
    // 2) 新标签：18-24/25-29/30-35/35-50/50+
    if (preferredAge === '少年')
        return ['少年', '18-24'];
    if (preferredAge === '青年')
        return ['青年', '18-24', '25-29', '30-35'];
    if (preferredAge === '中年')
        return ['中年', '35-50'];
    if (preferredAge === '老年')
        return ['老年', '50+'];
    return [preferredAge];
}
function parseStyleTags(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return new Set();
    return new Set(raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean));
}
function buildRecommendMeta(params) {
    const { weatherScoring, liveWeatherEnabled, usedFullTableFallback, rows } = params;
    if (usedFullTableFallback) {
        return {
            weather_scoring_enabled: weatherScoring,
            live_weather_enabled: liveWeatherEnabled,
            explain_summary: '本次为扩大范围随机展示；建议到衣库按标签进一步筛选。',
        };
    }
    if (weatherScoring && rows.length > 0) {
        const first = rows[0];
        const reasons = first.weather_score_reasons;
        if (reasons?.length) {
            return {
                weather_scoring_enabled: true,
                live_weather_enabled: liveWeatherEnabled,
                explain_summary: `排序说明（首套示例）：${reasons.slice(0, 3).join('；')}`,
            };
        }
        return {
            weather_scoring_enabled: true,
            live_weather_enabled: liveWeatherEnabled,
            explain_summary: '已按当前气温与天气现象对标签加权排序。',
        };
    }
    return {
        weather_scoring_enabled: false,
        live_weather_enabled: liveWeatherEnabled,
        explain_summary: '',
    };
}
/**
 * 官方衣库推荐：从「当季+场合+性别+年龄」逐步放宽 WHERE，避免一步跳到全表。
 * 顺序：先去掉年龄 → 再去掉性别 → 保留场合丢掉季节 → 仅场合 → 当季跨场合 → 全表。
 */
function buildRecommendFallbackSteps(occasionTag, season, preferredGender, ageCandidates) {
    const o = `%${occasionTag}%`;
    const s = `%${season}%`;
    const steps = [];
    const seenWhere = new Set();
    const push = (key, where, params) => {
        if (seenWhere.has(where))
            return;
        seenWhere.add(where);
        steps.push({ key, where, params });
    };
    const ageOr = () => {
        if (!ageCandidates.length)
            return null;
        const cond = ageCandidates.map(() => 'style_tags LIKE ?').join(' OR ');
        return { sql: `(${cond})`, params: ageCandidates.map((t) => `%${t}%`) };
    };
    // 与改造前主查询一致：当季 + 场合 + 可选性别/年龄
    if (preferredGender != null && ageCandidates.length > 0) {
        const a = ageOr();
        push('strict_os_gender_age', `style_tags LIKE ? AND style_tags LIKE ? AND style_tags LIKE ? AND ${a.sql}`, [o, s, `%${preferredGender}%`, ...a.params]);
    }
    else if (preferredGender != null) {
        push('strict_os_gender', `style_tags LIKE ? AND style_tags LIKE ? AND style_tags LIKE ?`, [o, s, `%${preferredGender}%`]);
    }
    else if (ageCandidates.length > 0) {
        const a = ageOr();
        push('strict_os_age', `style_tags LIKE ? AND style_tags LIKE ? AND ${a.sql}`, [o, s, ...a.params]);
    }
    else {
        push('strict_os', `style_tags LIKE ? AND style_tags LIKE ?`, [o, s]);
    }
    if (preferredGender != null && ageCandidates.length > 0) {
        push('os_gender_no_age', `style_tags LIKE ? AND style_tags LIKE ? AND style_tags LIKE ?`, [o, s, `%${preferredGender}%`]);
    }
    if (ageCandidates.length > 0 && preferredGender != null) {
        const a = ageOr();
        push('os_age_no_gender', `style_tags LIKE ? AND style_tags LIKE ? AND ${a.sql}`, [o, s, ...a.params]);
    }
    push('os_only', `style_tags LIKE ? AND style_tags LIKE ?`, [o, s]);
    if (preferredGender != null && ageCandidates.length > 0) {
        const a = ageOr();
        push('o_gender_age', `style_tags LIKE ? AND style_tags LIKE ? AND ${a.sql}`, [o, `%${preferredGender}%`, ...a.params]);
    }
    if (preferredGender != null) {
        push('o_gender', `style_tags LIKE ? AND style_tags LIKE ?`, [o, `%${preferredGender}%`]);
    }
    if (ageCandidates.length > 0) {
        const a = ageOr();
        push('o_age', `style_tags LIKE ? AND ${a.sql}`, [o, ...a.params]);
    }
    push('occasion_only', `style_tags LIKE ?`, [o]);
    if (preferredGender != null && ageCandidates.length > 0) {
        const a = ageOr();
        push('s_gender_age', `style_tags LIKE ? AND style_tags LIKE ? AND ${a.sql}`, [s, `%${preferredGender}%`, ...a.params]);
    }
    if (preferredGender != null) {
        push('s_gender', `style_tags LIKE ? AND style_tags LIKE ?`, [s, `%${preferredGender}%`]);
    }
    if (ageCandidates.length > 0) {
        const a = ageOr();
        push('s_age', `style_tags LIKE ? AND ${a.sql}`, [s, ...a.params]);
    }
    push('season_only', `style_tags LIKE ?`, [s]);
    push('full_table', '1=1', []);
    return steps;
}
/**
 * 当某阶梯只返回 1～2 条时，用同场合 → 当季 → 全表补满 limit，id NOT IN 去重。
 */
function padRowsToLimit(rows, limit, occasionTag, season) {
    let out = rows.slice(0, limit);
    let usedFullTablePad = false;
    if (out.length >= limit || out.length === 0) {
        return { rows: out, usedFullTablePad };
    }
    const o = `%${occasionTag}%`;
    const s = `%${season}%`;
    const seen = new Set(out.map((r) => Number(r.id)));
    const fetchMore = (where, baseParams, need) => {
        const ids = [...seen];
        const notIn = ids.length ? ` AND id NOT IN (${ids.map(() => '?').join(',')})` : '';
        const sql = `SELECT * FROM outfits WHERE (${where})${notIn} ORDER BY RANDOM() LIMIT ?`;
        return init_1.db.prepare(sql).all(...baseParams, ...ids, need);
    };
    let need = limit - out.length;
    let more = fetchMore('style_tags LIKE ?', [o], need);
    for (const m of more) {
        const id = Number(m.id);
        if (!seen.has(id)) {
            seen.add(id);
            out.push(m);
            if (out.length >= limit)
                return { rows: out, usedFullTablePad };
        }
    }
    need = limit - out.length;
    more = fetchMore('style_tags LIKE ?', [s], need);
    for (const m of more) {
        const id = Number(m.id);
        if (!seen.has(id)) {
            seen.add(id);
            out.push(m);
            if (out.length >= limit)
                return { rows: out, usedFullTablePad };
        }
    }
    need = limit - out.length;
    const ids = [...seen];
    const notIn = ids.length ? `WHERE id NOT IN (${ids.map(() => '?').join(',')})` : 'WHERE 1=1';
    const fullMore = init_1.db.prepare(`SELECT * FROM outfits ${notIn} ORDER BY RANDOM() LIMIT ?`).all(...ids, need);
    if (fullMore.length > 0)
        usedFullTablePad = true;
    out = [...out, ...fullMore].slice(0, limit);
    return { rows: out, usedFullTablePad };
}
/**
 * 快速穿搭推荐：根据天气 + 场合从衣库筛 3 套；random=1 时只返回 1 套随机。
 * Query: city?, occasion?, userId?（带 userId 时返回每套 unlocked）
 */
exports.recommendRouter.get('/', async (req, res) => {
    const city = req.query.city || '北京';
    const occasion = req.query.occasion || '日常';
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const random = req.query.random === '1' || req.query.random === 'true';
    /** 用户主动「换一换」等需重新抽选的请求，不得命中短缓存（否则会 60s 内始终返回同一批） */
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const skipCache = random || refresh;
    const limitParam = req.query.limit != null ? Number(req.query.limit) : NaN;
    const limit = random ? 1 : (Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : 3);
    let weather = mockWeatherForRecommend(city);
    if (RECOMMEND_LIVE_WEATHER) {
        try {
            weather = await Promise.race([
                (0, weather_1.getWeather)(city),
                new Promise((_, rej) => {
                    setTimeout(() => rej(new Error('weather-timeout')), RECOMMEND_WEATHER_BUDGET_MS);
                }),
            ]);
        }
        catch {
            weather = mockWeatherForRecommend(city);
        }
    }
    const season = getCurrentSeason();
    const occasionTag = isValidOccasion(occasion) ? occasion : '日常';
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const cacheKey = JSON.stringify({
        city,
        occasionTag,
        season,
        userId: userId ?? 0,
    });
    // 已登录用户若在「我的」中设置了性别和年龄段，大厅推荐只返回对应性别+年龄的穿搭
    let preferredGender = null;
    let preferredAge = null;
    if (userId != null) {
        const profile = init_1.db.prepare('SELECT preferred_gender, preferred_age FROM users WHERE id = ?').get(userId);
        if (profile?.preferred_gender === '男' || profile?.preferred_gender === '女')
            preferredGender = profile.preferred_gender;
        const ageRaw = profile?.preferred_age?.trim();
        if (ageRaw &&
            ['少年', '青年', '中年', '老年', '18-24', '25-29', '30-35', '35-50', '50+'].includes(ageRaw)) {
            preferredAge = ageRaw;
        }
    }
    // 首页大厅优先规则：当“我的衣库”数量 > 10 时，优先推荐我的衣库内容
    if (userId != null) {
        const cntRow = init_1.db.prepare('SELECT COUNT(*) AS c FROM user_wardrobe_items WHERE user_id = ?').get(userId);
        const wardrobeCount = Number(cntRow?.c || 0);
        if (wardrobeCount > 10) {
            const wardrobeRows = buildWardrobeRecommendRows(userId, limit, baseUrl);
            const wardrobeSuggestion = `${buildSuggestion(weather.temp, weather.desc, weather.city, season, occasionTag, preferredGender, preferredAge)}（本批优先来自「我的衣库」，共 ${wardrobeCount} 件可选）`;
            return res.json({
                weather: { temp: weather.temp, desc: weather.desc, city: weather.city },
                occasion,
                season,
                suggestion: wardrobeSuggestion,
                outfits: wardrobeRows,
                recommend_meta: {
                    weather_scoring_enabled: false,
                    live_weather_enabled: RECOMMEND_LIVE_WEATHER,
                    explain_summary: '本批来自「我的衣库」，未做天气加权排序。',
                },
            });
        }
    }
    // 命中缓存：仅官方衣库链路使用缓存（随机 / 手动刷新 / 我的衣库优先 均不命中）
    const cached = skipCache ? undefined : recommendCache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) {
        let cachedRows = cached.payload.outfits;
        if (userId != null) {
            cachedRows = cachedRows.map((o) => ({
                ...o,
                unlocked: (0, unlocks_1.isUnlocked)(userId, o.id),
            }));
        }
        return res.json({
            weather: cached.payload.weather,
            occasion: cached.payload.occasion,
            season: cached.payload.season,
            suggestion: cached.payload.suggestion,
            outfits: cachedRows,
            recommend_meta: cached.payload.recommend_meta ?? {
                weather_scoring_enabled: RECOMMEND_WEATHER_SCORE,
                live_weather_enabled: RECOMMEND_LIVE_WEATHER,
                explain_summary: '（缓存结果）',
            },
        });
    }
    const ageCandidates = ageCandidatesFromProfile(preferredAge);
    const steps = buildRecommendFallbackSteps(occasionTag, season, preferredGender, ageCandidates);
    let rows = [];
    let usedFullTableFallback = false;
    for (const step of steps) {
        rows = init_1.db
            .prepare(`SELECT * FROM outfits WHERE ${step.where} ORDER BY RANDOM() LIMIT ?`)
            .all(...step.params, limit);
        if (rows.length > 0) {
            if (step.key === 'full_table')
                usedFullTableFallback = true;
            break;
        }
    }
    const padded = padRowsToLimit(rows, limit, occasionTag, season);
    rows = padded.rows;
    if (padded.usedFullTablePad)
        usedFullTableFallback = true;
    // 天气重排（可选）：默认关闭，避免与外网天气/标签规则叠加导致接口变慢或难排查问题。
    if (RECOMMEND_WEATHER_SCORE) {
        rows = rows
            .map((row, idx) => {
            const tags = parseStyleTags(row.style_tags);
            const scoreDetail = (0, recommendWeather_1.weatherScoreDetail)(tags, weather.temp, weather.desc, occasionTag);
            return {
                row,
                idx,
                weather_score: scoreDetail.score,
                weather_score_reasons: scoreDetail.reasons,
            };
        })
            .sort((a, b) => {
            if (b.weather_score !== a.weather_score)
                return b.weather_score - a.weather_score;
            return a.idx - b.idx;
        })
            .map((item) => ({
            ...item.row,
            weather_score: item.weather_score,
            weather_score_reasons: item.weather_score_reasons,
        }));
    }
    if (userId != null) {
        rows = rows.map((o) => ({
            ...o,
            unlocked: (0, unlocks_1.isUnlocked)(userId, o.id),
        }));
    }
    const suggestion = buildSuggestion(weather.temp, weather.desc, weather.city, season, occasionTag, preferredGender, preferredAge);
    const suggestionTail = usedFullTableFallback
        ? '（标签匹配较少，已从官方衣库随机抽取；你可到衣库页按标签筛选）'
        : '';
    const optimizeHint = RECOMMEND_WEATHER_SCORE ? '（已按天气对候选搭配做了排序优化）' : '（推荐顺序为衣库随机抽取）';
    const recommend_meta = buildRecommendMeta({
        weatherScoring: RECOMMEND_WEATHER_SCORE,
        liveWeatherEnabled: RECOMMEND_LIVE_WEATHER,
        usedFullTableFallback,
        rows,
    });
    const payload = {
        weather: { temp: weather.temp, desc: weather.desc, city: weather.city },
        occasion,
        season,
        suggestion: `${suggestion}${suggestionTail}${optimizeHint}`,
        outfits: rows.map((o) => ({ ...o, source: 'outfit' })),
        recommend_meta,
    };
    if (!skipCache) {
        recommendCache.set(cacheKey, {
            expireAt: Date.now() + RECOMMEND_CACHE_TTL_MS,
            payload,
        });
    }
    res.json(payload);
});
/** 用户选择推荐中的一套时，记一条穿搭记录（用于用户画像） */
exports.recommendRouter.post('/record', (req, res) => {
    const { userId, outfitId, occasion, weatherTemp, weatherDesc } = req.body;
    if (!userId || !outfitId)
        return res.status(400).json({ error: '需要 userId, outfitId' });
    (0, outfitRecords_1.addOutfitRecord)(Number(userId), Number(outfitId), { occasion, weatherTemp, weatherDesc });
    res.json({ ok: true });
});
