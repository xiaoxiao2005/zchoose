# 穿搭应用后端

Node + Express + TypeScript + SQLite，为虚拟试衣、智能客服、推荐与积分提供 API；已为「AI 生成图后期美化」预留接口。

## 快速开始

1. 安装依赖  
   ```bash
   cd backend
   npm install
   ```

2. 复制环境变量  
   ```bash
   copy .env.example .env
   ```

3. 启动开发  
   ```bash
   npm run dev
   ```

4. 健康检查  
   - 浏览器或 curl 访问：`http://localhost:3000/api/health`  
   - 若提示端口被占用，可把 `.env` 里 `PORT` 改成其他端口（如 3001），或关闭占用 3000 的进程。

## 阶段 0 验收（跑通 + 登录）

1. 启动：`npm run dev`，访问 `http://localhost:3000/api/health` 应返回 `{"ok":true,"message":"后端正常"}`。
2. 注册：`POST /api/users/register`，body `{"email":"test@example.com","password":"123456"}`，返回 `token`、`userId`、`email`。
3. 登录：`POST /api/users/login`，body 同上，返回 `token`。后续请求在 Header 加 `Authorization: Bearer <token>` 即可鉴权（需鉴权接口会用到）。

## 已实现接口（占位/示例）

- `GET /api/health` — 健康检查
- `POST /api/users/register` — 注册（body: email, password），密码 bcrypt 哈希，返回 JWT
- `POST /api/users/login` — 登录（body: email, password），返回 JWT
- `GET /api/body-profile/options` — 体型选项列表（value/label，供前端下拉）
- `GET /api/body-profile/:userId` — 查询体型
- `PUT /api/body-profile/:userId` — 保存体型（body: gender, height_cm, weight_kg, body_type）
- `GET /api/outfits` — 衣库列表（可选 ?tags=日常,通勤）
- `GET /api/outfits/:id` — 单套搭配
- `POST /api/outfits` — 新增搭配（body: name, image_url, style_tags, need_points）
- `PUT /api/outfits/:id` — 更新搭配
- `DELETE /api/outfits/:id` — 删除搭配
- `POST /api/upload/photo` — 照片上传（multipart 字段 `photo`，5MB 内 JPG/PNG/WebP/GIF），返回 `photo_url`；静态文件 `/uploads/*`
- `POST /api/try-on/generate` — 试衣生成（body: userId, outfitId, photoUrl），返回 resultId、fullPrompt、三视图 URL（当前 mock）
- `GET /api/try-on/results/:resultId` — 查询某次试衣结果
- `POST /api/try-on/:resultId/beautify` — 后期美化（占位，body: type）
- **阶段 2**：`GET /api/points/:userId` — 查询积分；`POST /api/points/:userId/add` — 加积分（body: amount）
- `POST /api/support/chat` — 客服对话（body: userId, text?, image_url?, transferHuman?, leaveMessage?）；`GET /api/support/history/:userId` — 历史
- `POST /api/submissions` — 投稿（body: userId, image_url?, description?）；`GET /api/submissions/my/:userId`；`POST /api/submissions/:id/accept` 采纳加 10 积分
- `POST /api/unlocks` — 解锁搭配（body: userId, outfitId）；衣库 GET 带 `?userId=` 返回每套 `unlocked`；试衣生成前校验需解锁否则 403
- **阶段 3**：`GET /api/weather?city=北京` — 天气（mock/真实 API）；`GET /api/recommend?city=&occasion=&userId=&random=1` — 推荐 3 套或 1 套随机；`POST /api/recommend/record` — 记录选择；`GET /api/profile/:userId/style` — 用户穿搭风格摘要
- **阶段 4**：`POST /api/douyin/claim` — 提交抖音链接/截图（body: userId, link?, imageUrl?）；`GET /api/douyin/claims/my/:userId` — 我的核销记录；`POST /api/douyin/claims/:id/approve`（body: outfitId）— 通过并免费解锁一套；`GET /api/douyin/claims?status=pending` — 管理列表

## 数据与后续

- 数据库文件：`data/app.db`（SQLite）
- 实施顺序与你要做的事见项目根目录：`后端实施清单.md`

## 前后端基本搭建完成后请配置 API

在 **`backend/.env`** 中配置（参考 `.env.example`）：**图像生成**（IMAGE_GEN_*）、**智能客服 LLM**（LLM_*）、**天气**（WEATHER_PROVIDER + WEATHER_API_KEY 或 WEATHER_API_URL）、**JWT**（JWT_SECRET）。配置后重启后端生效。详见根目录 `后端实施清单.md` 第五节。
