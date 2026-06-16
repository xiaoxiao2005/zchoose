"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOutfitTags = normalizeOutfitTags;
exports.sanitizeStyleTagsString = sanitizeStyleTagsString;
exports.analyzeOutfitImage = analyzeOutfitImage;
const path_1 = __importDefault(require("path"));
const jimp_1 = require("jimp");
const THICKNESS_PRIORITY = ['厚实', '适中', '轻薄'];
/** 中性色优先于暖/冷，减少「又暖又冷」残留 */
const TONE_TAGS = ['中性色', '暖色', '冷色'];
const LIGHTNESS_TAGS = ['深色', '中明度', '浅色'];
const COLOR_GROUP_TAGS = [
    '黑色系',
    '白色系',
    '灰色系',
    '红色系',
    '橙色系',
    '黄色系',
    '绿色系',
    '蓝色系',
    '紫色系',
    '粉色系',
];
/** 连衣裙与上装同时出现（文件名+视觉合并）时保留连衣裙 */
const DRESS_OVER_TOP_PRIORITY = ['连衣裙', '上装'];
/** 明显无效或噪声片段，不参与推荐与天气加权 */
const TAG_BLACKLIST = new Set([
    '',
    '未命名',
    'null',
    'undefined',
    'N/A',
    'test',
    '去除图片左侧鞋子',
]);
const WARM_HUES = [
    [0, 25],
    [330, 360],
    [25, 70],
];
const COOL_HUES = [[70, 280]];
const CATEGORY_RULES = [
    { pattern: /(羽绒|棉服|大衣|风衣|夹克|外套|西装)/i, tag: '外套' },
    { pattern: /(衬衫|T恤|短袖|长袖|卫衣|毛衣|针织|上衣|背心|吊带)/i, tag: '上装' },
    { pattern: /(裤|牛仔|阔腿|短裤|半裙|裙|下装)/i, tag: '下装' },
    { pattern: /(连衣裙)/i, tag: '连衣裙' },
    { pattern: /(鞋|靴|凉鞋|运动鞋|皮鞋)/i, tag: '鞋子' },
];
const THICKNESS_RULES = [
    { pattern: /(羽绒|棉服|毛呢|呢子|加绒|羊绒|厚)/i, tag: '厚实' },
    { pattern: /(外套|卫衣|针织|夹克|长袖|风衣|西装)/i, tag: '适中' },
    { pattern: /(短袖|背心|吊带|薄|短裤|半裙|雪纺)/i, tag: '轻薄' },
];
/** 低于此平均饱和度视为低置信度，不强制按色相分色系，只保留中性色+黑白灰明度 */
const LOW_SATURATION_THRESHOLD = 0.12;
function inAnyRange(value, ranges) {
    return ranges.some(([start, end]) => value >= start && value < end);
}
function normalizeHue(deg) {
    let h = deg % 360;
    if (h < 0)
        h += 360;
    return h;
}
function colorGroupFromHue(hue, sat, light) {
    if (sat < 0.12) {
        if (light < 0.25)
            return '黑色系';
        if (light > 0.82)
            return '白色系';
        return '灰色系';
    }
    if (hue < 25 || hue >= 330)
        return '红色系';
    if (hue < 50)
        return '橙色系';
    if (hue < 70)
        return '黄色系';
    if (hue < 170)
        return '绿色系';
    if (hue < 260)
        return '蓝色系';
    if (hue < 300)
        return '紫色系';
    return '粉色系';
}
function toneFromHSV(hue, sat) {
    if (sat < 0.12)
        return '中性色';
    if (inAnyRange(hue, WARM_HUES))
        return '暖色';
    if (inAnyRange(hue, COOL_HUES))
        return '冷色';
    return '中性色';
}
function lightnessTag(light) {
    if (light < 0.35)
        return '深色';
    if (light > 0.72)
        return '浅色';
    return '中明度';
}
function tagsFromFileName(fileNameWithoutExt) {
    const tags = new Set();
    for (const rule of CATEGORY_RULES) {
        if (rule.pattern.test(fileNameWithoutExt))
            tags.add(rule.tag);
    }
    for (const rule of THICKNESS_RULES) {
        if (rule.pattern.test(fileNameWithoutExt))
            tags.add(rule.tag);
    }
    return Array.from(tags);
}
function keepOneByPriority(tags, ordered) {
    const hit = ordered.find((t) => tags.has(t));
    ordered.forEach((t) => tags.delete(t));
    if (hit)
        tags.add(hit);
}
/**
 * 互斥与清洗：厚度/色温/明度/色系/裙与上装只保留一个；黑名单丢弃。
 * 供「自动打标」「后台入库」「sanitize 脚本」共用。
 */
function normalizeOutfitTags(input) {
    const tags = new Set(input
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => t.length <= 32)
        .filter((t) => !TAG_BLACKLIST.has(t)));
    keepOneByPriority(tags, DRESS_OVER_TOP_PRIORITY);
    keepOneByPriority(tags, THICKNESS_PRIORITY);
    keepOneByPriority(tags, TONE_TAGS);
    keepOneByPriority(tags, LIGHTNESS_TAGS);
    keepOneByPriority(tags, COLOR_GROUP_TAGS);
    return Array.from(tags);
}
/**
 * 对整段逗号分隔字符串做治理：黑名单 + 互斥 + 排序无关，写入 DB 前调用。
 */
function sanitizeStyleTagsString(raw) {
    const parts = (raw || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => t.length <= 32)
        .filter((t) => !TAG_BLACKLIST.has(t));
    return normalizeOutfitTags(parts).join(',');
}
async function analyzeOutfitImage(imageAbsPath, displayName) {
    const img = await jimp_1.Jimp.read(imageAbsPath);
    img.resize({ w: 64, h: 64 });
    const { data, width, height } = img.bitmap;
    const totalPixels = width * height;
    let hueSum = 0;
    let satSum = 0;
    let lightSum = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        const light = (max + min) / 2;
        let hue = 0;
        if (delta > 0) {
            if (max === r)
                hue = ((g - b) / delta) % 6;
            else if (max === g)
                hue = (b - r) / delta + 2;
            else
                hue = (r - g) / delta + 4;
            hue *= 60;
        }
        hue = normalizeHue(hue);
        const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
        hueSum += hue;
        satSum += sat;
        lightSum += light;
    }
    const avgHue = normalizeHue(hueSum / totalPixels);
    const avgSat = satSum / totalPixels;
    const avgLight = lightSum / totalPixels;
    const fileStem = path_1.default.parse(displayName).name;
    const nameTags = tagsFromFileName(fileStem);
    const tags = new Set(nameTags);
    // 低饱和低置信：不强行按色相分色，仅中性色 + 明度 + 黑/白/灰系（阈值 0.12）
    if (avgSat < LOW_SATURATION_THRESHOLD) {
        tags.add('中性色');
        tags.add(lightnessTag(avgLight));
        tags.add(avgLight < 0.25 ? '黑色系' : avgLight > 0.82 ? '白色系' : '灰色系');
    }
    else {
        tags.add(toneFromHSV(avgHue, avgSat));
        tags.add(lightnessTag(avgLight));
        tags.add(colorGroupFromHue(avgHue, avgSat, avgLight));
    }
    const normalizedTags = normalizeOutfitTags(Array.from(tags));
    return {
        tags: normalizedTags,
        metrics: {
            avgHue: Number(avgHue.toFixed(2)),
            avgSat: Number(avgSat.toFixed(4)),
            avgLight: Number(avgLight.toFixed(4)),
        },
    };
}
