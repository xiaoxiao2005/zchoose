"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeather = getWeather;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_API_URL = process.env.WEATHER_API_URL; // 自定义单 URL 时用（见下方「通用单 URL」）
const WEATHER_PROVIDER = process.env.WEATHER_PROVIDER; // 填 qweather 时走和风天气两步请求+结构映射
/** 外网天气请求超时（毫秒）；超时则降级 mock，避免 /api/recommend 等接口长时间挂起导致首页一直「加载中」 */
const WEATHER_FETCH_TIMEOUT_MS = Number(process.env.WEATHER_FETCH_TIMEOUT_MS) || 8000;
function weatherFetchSignal() {
    return AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS);
}
/** Mock 数据（仅在所有 API 均失败时使用） */
function mockWeather(city) {
    return {
        temp: 22,
        desc: '晴',
        city: city || '北京',
    };
}
/**
 * Open-Meteo：免 key 开源天气 API，未配置和风/自定义时使用。
 * 文档：https://open-meteo.com/en/docs | 地理编码 https://geocoding-api.open-meteo.com/v1/search
 */
const WMO_TO_DESC = {
    0: '晴', 1: '晴', 2: '多云', 3: '阴',
    45: '雾', 48: '雾',
    51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
    61: '雨', 63: '雨', 65: '雨', 66: '冻雨', 67: '冻雨',
    71: '雪', 73: '雪', 75: '雪', 77: '米雪',
    80: '阵雨', 81: '阵雨', 82: '阵雨', 85: '阵雪', 86: '阵雪',
    95: '雷雨', 96: '雷雨', 99: '雷雨',
};
async function fetchOpenMeteo(city) {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`, { signal: weatherFetchSignal() });
    const geoData = (await geoRes.json());
    if (!geoData.results?.length) {
        return mockWeather(city);
    }
    const { latitude, longitude, name } = geoData.results[0];
    const forecastRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=Asia/Shanghai`, { signal: weatherFetchSignal() });
    const forecastData = (await forecastRes.json());
    const current = forecastData.current;
    if (!current)
        return mockWeather(city);
    const temp = Number(current.temperature_2m);
    const code = current.weather_code ?? 0;
    const desc = WMO_TO_DESC[code] ?? '晴';
    return {
        temp: Number.isNaN(temp) ? 22 : temp,
        desc,
        city: name || city,
    };
}
/**
 * 和风天气：先城市查 location id，再查实时天气，并按官方返回结构映射 temp、text。
 * 文档：https://dev.qweather.com/docs/api/geoapi/city-lookup 、 https://dev.qweather.com/docs/api/weather/weather-now
 */
async function fetchQWeather(city) {
    const key = WEATHER_API_KEY;
    const locationName = encodeURIComponent(city);
    const lookupRes = await fetch(`https://geoapi.qweather.com/v2/city/lookup?location=${locationName}&key=${key}`, { signal: weatherFetchSignal() });
    const lookupData = (await lookupRes.json());
    if (lookupData.code !== '200' || !lookupData.location?.length) {
        return mockWeather(city);
    }
    const locationId = lookupData.location[0].id;
    const nowRes = await fetch(`https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${key}`, { signal: weatherFetchSignal() });
    const nowData = (await nowRes.json());
    if (nowData.code !== '200' || !nowData.now) {
        return mockWeather(city);
    }
    const temp = Number(nowData.now.temp);
    const desc = nowData.now.text ?? '晴';
    return {
        temp: Number.isNaN(temp) ? 22 : temp,
        desc,
        city: lookupData.location[0].name || city,
    };
}
/**
 * 通用单 URL：WEATHER_API_URL 为完整请求地址，请求后按常见字段尝试解析。
 * 若接入其他厂商（如心知），可在此增加 else if (WEATHER_PROVIDER === 'seniverse') 并写对应映射。
 */
async function fetchGenericUrl(city) {
    const url = `${WEATHER_API_URL}?city=${encodeURIComponent(city)}&key=${WEATHER_API_KEY}`;
    const res = await fetch(url, { signal: weatherFetchSignal() });
    const data = (await res.json());
    const now = data.now;
    const temp = Number(now?.temp ?? data.temp ?? data.temperature ?? 22);
    const desc = String(now?.text ?? data.desc ?? data.text ?? data.weather ?? '晴');
    return {
        temp: Number.isNaN(temp) ? 22 : temp,
        desc,
        city,
    };
}
/**
 * 按城市获取天气（温度、现象）。
 * - WEATHER_PROVIDER=qweather 且配置 KEY：走和风天气（城市 lookup → 实时 now）。
 * - 仅配置 WEATHER_API_URL + WEATHER_API_KEY：单次请求该 URL，按常见字段解析。
 * - 未配置上述：走 Open-Meteo 免 key 开源 API（地理编码 + 实时天气），失败时返回 mock。
 */
async function getWeather(city) {
    const c = city || '北京';
    if (WEATHER_PROVIDER === 'qweather' && WEATHER_API_KEY) {
        try {
            return await fetchQWeather(c);
        }
        catch {
            // 和风失败时继续降级到 Open-Meteo，避免长期固定回退 22℃
            try {
                return await fetchOpenMeteo(c);
            }
            catch {
                return mockWeather(c);
            }
        }
    }
    if (WEATHER_API_URL && WEATHER_API_KEY) {
        try {
            return await fetchGenericUrl(c);
        }
        catch {
            // 自定义单 URL 失败时同样尝试 Open-Meteo，再兜底 mock
            try {
                return await fetchOpenMeteo(c);
            }
            catch {
                return mockWeather(c);
            }
        }
    }
    try {
        return await fetchOpenMeteo(c);
    }
    catch {
        return mockWeather(c);
    }
}
