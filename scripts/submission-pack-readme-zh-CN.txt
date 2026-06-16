本压缩包用于「源代码与代表性素材」提交说明
============================================
已包含：
- frontend/  前端源码（已排除 node_modules）
- backend/   后端源码（已排除 node_modules、dist、uploads、.env）
- tryon-service/ 试衣微服务源码（已排除 venv、result 等运行产物）
- docs/      设计与开发文档（若存在）
- root-md-notes/ 根目录部分 *.md

未包含（请在说明或演示中自行交代）：
- node_modules（可 npm install 还原）
- backend/uploads/ 用户上传照片（隐私与体积）
- backend/.env 密钥（请复制 .env.example 自行填写）
- tryon-service/result/ 本地试衣输出图

代表性素材：frontend/public/images/ 下为项目衣库与体型示意等静态资源。
若组委会限制单文件体积，可再拆分或删减 public/images 中非答辩必需子目录后重新打包。
