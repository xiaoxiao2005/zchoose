"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weatherRouter = void 0;
const express_1 = require("express");
const weather_1 = require("../services/weather");
exports.weatherRouter = (0, express_1.Router)();
/** 按城市获取天气（温度、现象）。未配置 WEATHER_API 时返回 mock。 */
exports.weatherRouter.get('/', async (req, res) => {
    const city = req.query.city || '北京';
    const data = await (0, weather_1.getWeather)(city);
    res.json(data);
});
