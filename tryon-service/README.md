# 虚拟试衣服务（FASHN VTON）

本服务使用 **FASHN VTON v1.5** 生成试衣图，支持云 API 或自建服务。

- **FASHN VTON v1.5**：[GitHub](https://github.com/fashn-AI/fashn-vton-1.5)，通过 FASHN 云 API 或自建 FASHN_VTON_URL 调用。

## 依赖

- Python 3.10+
- 需配置 FASHN_API_KEY（云 API）或 FASHN_VTON_URL（自建），无需本地 GPU

## 安装与运行

```bash
cd tryon-service
pip install -r requirements.txt
```

**配置 FASHN API Key（二选一）：**

1. **推荐**：在 `tryon-service` 目录下复制 `.env.example` 为 `.env`，填入你的 Key：
   ```bash
   # Windows
   copy .env.example .env
   # 然后编辑 .env，将 FASHN_API_KEY=你的key 改为真实 key
   ```
   `.env` 不要提交到 git，避免泄露。

2. 或启动时设置环境变量：
   ```bash
   # Windows
   set FASHN_API_KEY=你的key
   python main.py
   ```

```bash
python main.py
```

服务默认监听 `http://0.0.0.0:8000`。可选环境变量：

- `PORT`：端口，默认 8000
- `FASHN_API_KEY`：FASHN 云 API Key（[fashn.ai](https://fashn.ai) 获取）
- `FASHN_VTON_URL`：自建 FASHN v1.5 服务地址（与当前 `/generate` 同格式）

## 与后端对接

在**后端**运行环境设置：

```bash
TRYON_API_URL=http://localhost:8000/generate
BASE_URL=http://localhost:3001
```

试衣页点击「生成三视图」时，后端会把人物照、搭配图发给本服务；本服务返回三视图 URL（当前只出一张图，正面/侧面/背面暂用同一张）。

## 图片要求与效果说明

- **人物照（personPhotoUrl）**：建议上传本人正面照（上半身或全身），人脸清晰、光线均匀。
- **搭配图（outfitImageUrl）**：单件服装平铺图或商品图效果最佳；整套搭配图也可试，效果可能偏风格迁移。
- **身高、体重、体型**：会写入提示词供模型参考，生成图的人物比例主要仍由人物照决定。

## 接口说明

- **POST /generate**  
  - Body: `{ personPhotoUrl, outfitImageUrl, prompt?, body_type_label?, model? }`  
  - 返回: `{ front_url, side_url, back_url }`（均为图片 URL 或 data URL）

- **GET /health**  
  - 健康检查

- **GET /models**  
  - 返回可用模型列表（当前仅 FASHN VTON v1.5）
