"use strict";
/**
 * 试衣三视图生成服务
 * - 输入：用户头像照、搭配图、身材与体型描述（身高体重体型等）
 * - 输出：正面、侧面、背面三张图 URL（或 data URL）
 *
 * 接入真实生成能力时：
 * 1. 设置环境变量 TRYON_API_URL（例如 http://localhost:8000/generate）
 * 2. 该接口需接受 POST，body 为 JSON：
 *    { personPhotoUrl, outfitImageUrl, prompt, height_cm, weight_kg, body_type_label, gender }
 * 3. 返回 JSON：{ front_url, side_url, back_url }（或 base64 data URL）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTryOnThreeViews = generateTryOnThreeViews;
const svgPlaceholder = (text) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect fill="#e2e8f0" width="400" height="600"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-size="28" font-family="sans-serif">${text}</text></svg>`)}`;
/**
 * 生成符合用户人物形象与身高体重体型的三视图试衣图
 * 若配置了 TRYON_API_URL 则请求外部 API，否则返回占位图
 */
async function generateTryOnThreeViews(input) {
    const apiUrl = process.env.TRYON_API_URL;
    if (!apiUrl) {
        console.warn('[tryOnGenerate] 未配置 TRYON_API_URL，返回占位图。请在 backend/.env 中设置 TRYON_API_URL=http://localhost:8000/generate 并启动 tryon-service');
        return getMockThreeViews('请配置 backend 的 TRYON_API_URL 并启动 tryon-service（如 cd tryon-service && python main.py）');
    }
    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personPhotoUrl: input.personPhotoUrl,
                outfitImageUrl: input.outfitImageUrl,
                prompt: input.prompt,
                height_cm: input.height_cm,
                weight_kg: input.weight_kg,
                body_type_label: input.body_type_label,
                gender: input.gender,
                model: input.model === 'fashn-vton' ? 'fashn-vton' : 'fashn-vton',
            }),
        });
        const raw = await res.text();
        if (!res.ok) {
            console.warn('[tryOnGenerate] 试衣服务返回错误:', res.status, raw.slice(0, 200));
            let hint = '试衣服务调用失败（' + res.status + '），请确认 tryon-service 已启动且 TRYON_API_URL 正确';
            try {
                const errBody = raw ? JSON.parse(raw) : {};
                if (errBody.detail && typeof errBody.detail === 'string')
                    hint = errBody.detail;
            }
            catch {
                // 使用默认 hint
            }
            return getMockThreeViews(hint);
        }
        let data;
        try {
            data = (raw ? JSON.parse(raw) : {});
        }
        catch {
            console.warn('[tryOnGenerate] 试衣服务返回非 JSON:', raw.slice(0, 100));
            return getMockThreeViews('试衣服务返回数据格式异常，请查看 tryon-service 日志');
        }
        if (data.front_url && data.side_url && data.back_url) {
            return { front_url: data.front_url, side_url: data.side_url, back_url: data.back_url };
        }
        console.warn('[tryOnGenerate] 试衣服务返回格式异常，缺少 front_url/side_url/back_url');
        return getMockThreeViews('试衣服务返回数据不完整，请查看 tryon-service 日志');
    }
    catch (e) {
        console.warn('[tryOnGenerate] 请求试衣服务异常:', e);
        return getMockThreeViews('无法连接试衣服务，请确认 tryon-service 已启动（如 cd tryon-service && python main.py）');
    }
}
function getMockThreeViews(hint) {
    const out = {
        front_url: svgPlaceholder('正面'),
        side_url: svgPlaceholder('侧面'),
        back_url: svgPlaceholder('背面'),
    };
    if (hint)
        out.hint = hint;
    return out;
}
