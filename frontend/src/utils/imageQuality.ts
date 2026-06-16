export interface ImageQualityResult {
  pass: boolean;
  score: number;
  issues: string[];
  suggestion: string;
}

const MIN_WIDTH = 480;
const MIN_HEIGHT = 640;
const MIN_BLUR_SCORE = 22;
const MIN_BRIGHTNESS = 35;
const MAX_BRIGHTNESS = 225;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

function loadImageFromUrl(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = imageUrl.startsWith('data:') ? null : 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = imageUrl;
  });
}

async function runQualityCheck(img: HTMLImageElement): Promise<ImageQualityResult> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(img.naturalWidth / 2));
  canvas.height = Math.max(1, Math.floor(img.naturalHeight / 2));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { pass: true, score: 100, issues: [], suggestion: '' };
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // 平均亮度
  let brightnessSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    brightnessSum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  const avgBrightness = brightnessSum / (data.length / 4);

  // 粗略清晰度：相邻像素灰度差平均值
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width - 1; x += 2) {
      const idx = (y * canvas.width + x) * 4;
      const idxNext = (y * canvas.width + x + 1) * 4;
      const g1 = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const g2 = (data[idxNext] + data[idxNext + 1] + data[idxNext + 2]) / 3;
      edgeSum += Math.abs(g1 - g2);
      edgeCount += 1;
    }
  }
  const blurScore = edgeCount > 0 ? edgeSum / edgeCount : 100;

  const issues: string[] = [];
  if (img.naturalWidth < MIN_WIDTH || img.naturalHeight < MIN_HEIGHT) issues.push('分辨率偏低');
  if (blurScore < MIN_BLUR_SCORE) issues.push('图片较模糊');
  if (avgBrightness < MIN_BRIGHTNESS) issues.push('图片偏暗');
  if (avgBrightness > MAX_BRIGHTNESS) issues.push('图片过曝');

  const score = Math.max(
    0,
    Math.min(100, Math.round(100 - (issues.length * 20 + Math.max(0, MIN_BLUR_SCORE - blurScore))))
  );
  // 业务规则：评分 >= 50 允许上传；低于 50 才拦截
  const pass = score >= 50;
  const suggestion = pass
    ? ''
    : `检测到：${issues.join('、')}。建议在光线充足、背景干净环境重拍，保持衣物清晰并占画面主要区域。`;

  return { pass, score, issues, suggestion };
}

export async function checkImageQuality(file: File): Promise<ImageQualityResult> {
  const img = await loadImage(file);
  return runQualityCheck(img);
}

export async function checkImageQualityFromUrl(imageUrl: string): Promise<ImageQualityResult> {
  const img = await loadImageFromUrl(imageUrl);
  return runQualityCheck(img);
}
