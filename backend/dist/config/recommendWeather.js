"use strict";
/**
 * 首页/推荐「按标签天气加权排序」所用规则（F1：与路由解耦，仅改此处即可调参）。
 * 仅当环境变量 RECOMMEND_WEATHER_SCORE=1 时由 recommend 路由使用。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEATHER_SCORING_RULES = void 0;
exports.weatherScoreDetail = weatherScoreDetail;
exports.WEATHER_SCORING_RULES = {
    byTemp: [
        { maxTemp: 10, delta: { 厚实: 3, 外套: 2, 轻薄: -3 } },
        { maxTemp: 17, delta: { 外套: 2, 适中: 2, 轻薄: -1 } },
        { maxTemp: 26, delta: { 适中: 2, 厚实: -1 } },
        { maxTemp: Number.POSITIVE_INFINITY, delta: { 轻薄: 3, 厚实: -3, 外套: -2 } },
    ],
    rainy: { 深色: 1, 浅色: -1, 鞋子: -1 },
    windy: { 轻薄: -1, 外套: 1 },
    byOccasion: [
        { occasion: '通勤', delta: { 外套: 1, 适中: 1 } },
        { occasion: '运动', delta: { 轻薄: 1 } },
    ],
};
function scoreByTagDelta(tags, delta) {
    let score = 0;
    Object.entries(delta).forEach(([tag, value]) => {
        if (tags.has(tag))
            score += value;
    });
    return score;
}
function collectScoreReasons(tags, delta, prefix) {
    const reasons = [];
    Object.entries(delta).forEach(([tag, value]) => {
        if (!tags.has(tag) || value === 0)
            return;
        reasons.push({
            reason: `${prefix}命中${tag}`,
            delta: value,
        });
    });
    return reasons;
}
/** 根据当前气温、天气文案、场合，对单套搭配的标签打分并给出可读原因（用于可解释推荐 F2） */
function weatherScoreDetail(tags, temp, desc, occasion) {
    const weatherDesc = (desc || '').toLowerCase();
    const rainy = /(雨|rain|shower|thunder)/i.test(weatherDesc);
    const windy = /(风|wind|gust)/i.test(weatherDesc);
    const tempRule = exports.WEATHER_SCORING_RULES.byTemp.find((rule) => temp <= rule.maxTemp);
    let score = 0;
    const reasons = [];
    if (tempRule) {
        score += scoreByTagDelta(tags, tempRule.delta);
        reasons.push(...collectScoreReasons(tags, tempRule.delta, '温度规则'));
    }
    if (rainy) {
        score += scoreByTagDelta(tags, exports.WEATHER_SCORING_RULES.rainy);
        reasons.push(...collectScoreReasons(tags, exports.WEATHER_SCORING_RULES.rainy, '降雨规则'));
    }
    if (windy) {
        score += scoreByTagDelta(tags, exports.WEATHER_SCORING_RULES.windy);
        reasons.push(...collectScoreReasons(tags, exports.WEATHER_SCORING_RULES.windy, '大风规则'));
    }
    const occasionRule = exports.WEATHER_SCORING_RULES.byOccasion.find((rule) => rule.occasion === occasion);
    if (occasionRule) {
        score += scoreByTagDelta(tags, occasionRule.delta);
        reasons.push(...collectScoreReasons(tags, occasionRule.delta, '场景规则'));
    }
    const reasonTexts = reasons
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .map((item) => `${item.reason}${item.delta > 0 ? ' +' : ' '}${item.delta}`);
    return {
        score,
        reasons: reasonTexts,
    };
}
