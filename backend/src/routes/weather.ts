import { Router } from 'express';
import { getWeather } from '../services/weather';

export const weatherRouter = Router();

/** 按城市获取天气（温度、现象）。未配置 WEATHER_API 时返回 mock。 */
weatherRouter.get('/', async (req, res) => {
  const city = (req.query.city as string) || '北京';
  const data = await getWeather(city);
  res.json(data);
});
