"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTryOnPrompt = buildTryOnPrompt;
const init_1 = require("../db/init");
const FIXED_PREFIX = '人物试衣三视图，保持人物面部与身份一致，身材符合以下描述：';
const FIXED_SUFFIX = '。输出正面、侧面、背面三张图，风格统一、光线自然、符合身高体重与体型。';
/** 体型 value → 中文标签（用于生成提示词） */
const BODY_TYPE_LABEL = {
    pear: '梨型', inv_triangle_f: '倒三角型', hourglass: '沙漏型', h_type: 'H型', apple: '苹果型',
    o_type: 'O型', triangle: '正三角型', rectangle: '矩形', inv_triangle_m: '倒三角型', inv_trapezoid: '倒梯型',
};
/**
 * 根据用户体型 + 衣库搭配组装完整试衣提示词（供图像生成 API 使用）
 * 包含：性别、身高、体重、体型标签、体型描述、搭配描述
 */
function buildTryOnPrompt(userId, outfitId, override) {
    const body = init_1.db.prepare('SELECT gender, height_cm, weight_kg, body_type, prompt_snippet, extra_prompt FROM body_profiles WHERE user_id = ?').get(userId);
    const outfit = init_1.db.prepare('SELECT name, style_tags, image_url FROM outfits WHERE id = ?').get(outfitId);
    if (!outfit)
        return null;
    const bodySnippet = body?.prompt_snippet || '';
    const bodyTypeValue = override?.body_type ?? body?.body_type ?? null;
    const bodyTypeLabel = bodyTypeValue ? (BODY_TYPE_LABEL[bodyTypeValue] ?? bodyTypeValue) : null;
    const parts = [];
    if (body?.gender)
        parts.push(`性别：${body.gender}`);
    const h = override?.height_cm ?? body?.height_cm;
    if (h != null)
        parts.push(`身高${h}cm`);
    const w = override?.weight_kg ?? body?.weight_kg;
    if (w != null)
        parts.push(`体重${w}kg`);
    if (bodyTypeLabel)
        parts.push(`体型：${bodyTypeLabel}`);
    if (bodySnippet)
        parts.push(bodySnippet);
    const extra = override?.extra_prompt ?? body?.extra_prompt;
    if (extra)
        parts.push(extra);
    const bodyDesc = parts.length ? parts.join('；') + '。' : '';
    const outfitDesc = `搭配：${outfit.name}${outfit.style_tags ? `，风格：${outfit.style_tags}` : ''}`;
    const fullPrompt = [FIXED_PREFIX, bodyDesc, outfitDesc, FIXED_SUFFIX].filter(Boolean).join('');
    return {
        fullPrompt,
        bodySnippet,
        outfitDesc,
        bodyTypeLabel,
        height_cm: h ?? null,
        weight_kg: w ?? null,
        gender: body?.gender ?? null,
    };
}
