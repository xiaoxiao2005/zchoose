# 试衣三视图生成 API 对接说明

当前试衣功能会根据**用户人物照**、**身高体重体型**和**所选搭配**组装提示词，并生成正面/侧面/背面三视图。未配置外部 API 时返回占位图；配置后由你的服务生成真实图片。

## 使用 tryon-service（FASHN VTON）

项目内已提供 **tryon-service**（Python），使用 [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5) 生成试衣图（云 API 或自建）：

1. 配置 FASHN：设置环境变量 `FASHN_API_KEY`（云 API）或 `FASHN_VTON_URL`（自建），进入目录并启动试衣服务：
   ```bash
   cd tryon-service
   pip install -r requirements.txt
   python main.py
   ```
2. 后端设置环境变量后启动：
   ```bash
   set TRYON_API_URL=http://localhost:8000/generate
   set BASE_URL=http://localhost:3001
   npm run dev
   ```
3. 试衣页上传人物照、选体型与搭配后点击「生成三视图」，即可得到 FASHN VTON 生成的试衣图（当前为单张图，三视图暂用同一张）。

详见 **tryon-service/README.md**。

## 1. 流程说明

1. 用户在试衣页上传头像照，选择性别与体型（梨型、沙漏型等），填写身高、体重，选择一套搭配。
2. 后端组装完整提示词（含：性别、身高、体重、体型标签、体型描述、搭配名称与风格）。
3. 调用生成服务：若配置了 `TRYON_API_URL`，则 POST 到该地址；否则返回占位图。
4. 生成结果写入 `tryon_results` 表并返回给前端展示。

## 2. 接入你的生成服务

在环境变量中设置：

```bash
TRYON_API_URL=http://你的服务地址/generate
# 可选：前端访问后端时的基础 URL，用于把相对路径的图片地址转成绝对地址供你的服务拉取
BASE_URL=http://localhost:3001
```

你的服务需提供一个 **POST** 接口，接收 JSON body，并返回三张图的 URL。

### 请求体示例

```json
{
  "personPhotoUrl": "http://localhost:3001/uploads/photo_xxx.jpg",
  "outfitImageUrl": "http://localhost:3001/images/1-日常.png",
  "prompt": "人物试衣三视图，保持人物面部与身份一致，身材符合以下描述：性别：女；身高165cm；体重55kg；体型：梨型；梨型身材，下半身较丰满...。搭配：xxx，风格：日常。。输出正面、侧面、背面三张图...",
  "height_cm": 165,
  "weight_kg": 55,
  "body_type_label": "梨型",
  "gender": "女"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| personPhotoUrl | string | 用户上传的人物照绝对 URL，你的服务可下载用于生成 |
| outfitImageUrl | string \| null | 所选搭配图的绝对 URL，可能为空 |
| prompt | string | 完整试衣提示词（含身材与搭配描述） |
| height_cm | number \| null | 身高（厘米） |
| weight_kg | number \| null | 体重（千克） |
| body_type_label | string \| null | 体型中文标签，如 梨型、沙漏型、H型 |
| gender | string \| null | 性别：男 / 女 |

### 响应体要求

返回 JSON，且需包含三视图 URL（可为 http(s) 或 data URL）：

```json
{
  "front_url": "https://... 或 data:image/...",
  "side_url": "https://... 或 data:image/...",
  "back_url": "https://... 或 data:image/..."
}
```

- 若你的服务返回 HTTP 状态码非 2xx，或缺少任一 URL，后端会退回占位图并记录日志。
- 建议图片尺寸与风格统一（如 400×600），便于前端展示。

## 3. 实现建议

- **人物形象**：用 `personPhotoUrl` 做人脸/身份一致化，结合 `height_cm`、`weight_kg`、`body_type_label`、`gender` 控制身材比例与体型。
- **试衣效果**：用 `outfitImageUrl` 与 `prompt` 中的搭配描述生成穿该款式的三视图。
- 可选用虚拟试衣模型（如 FASHN VTON、OOTDiffusion 等）或自研管线，只需满足上述请求/响应格式即可与当前后端对接。
