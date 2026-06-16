# Zchoose 前端

Vite + React + TypeScript。横屏游戏式布局。

## 启动

```bash
cd frontend
npm install
npm run dev
```

浏览器访问 **http://localhost:5173**，默认进入 `/splash` 启动闪屏，结束后跳转 `/home` 大厅。

## 当前已实现

- **启动闪屏**（`/splash`）：黑屏 → 闪亮 → Zchoose 紫色渐变 → 进入首页
- **全局 Shell**：顶栏、左侧 6 个功能、底栏 5 个入口、右侧主区
- **首页大厅**（`/home`）：天气、今日推荐三卡、换一换/随机抽一套、立即试衣/快速穿搭
- **占位页**：衣库、快速穿搭、试衣、客服、我的（后续按顺序实现）

## 接下来逐步完成的页面

详见 **`前端页面实施顺序.md`**，建议顺序：

1. 登录/注册  
2. 衣库  
3. 虚拟试衣  
4. 快速穿搭  
5. 智能客服  
6. 我的  

## 路由

| 路径        | 说明     |
|-------------|----------|
| `/`         | → `/splash` |
| `/splash`   | 启动闪屏 |
| `/home`     | 大厅     |
| `/outfits`  | 衣库     |
| `/recommend`| 快速穿搭 |
| `/tryon`    | 虚拟试衣 |
| `/support`  | 智能客服 |
| `/me`       | 我的     |

后端 API 代理：开发环境下 `/api`、`/uploads` 转发到 `http://localhost:3000`，需先启动 backend。
