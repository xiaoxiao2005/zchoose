import path from 'path';

/**
 * 与 index 中 static 中间件使用的路径一致：frontend/public/images
 * 用于衣库图片、预设背景图等静态资源。
 */
export function getImagesDir(): string {
  return path.join(__dirname, '../../frontend/public/images');
}

export const PRESET_BG_DIR_NAME = '预设背景图';

export function getPresetBackgroundDir(): string {
  return path.join(getImagesDir(), PRESET_BG_DIR_NAME);
}
