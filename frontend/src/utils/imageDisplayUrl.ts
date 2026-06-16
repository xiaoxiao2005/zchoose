/** 开发时直连后端加载静态图，避免 Vite 代理对中文/空格/括号文件名处理不一致 */
const IMAGE_ORIGIN = import.meta.env.DEV ? (import.meta.env.VITE_IMAGE_ORIGIN || 'http://localhost:3001') : '';

/**
 * 相对路径含中文、空格、括号等时需规范编码；与衣库 OutfitCard 一致。
 * 先 decode 再 encode，避免路径被二次编码导致 404。
 */
export function imageDisplayUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  try {
    const encoded = encodeURI(decodeURI(url));
    return IMAGE_ORIGIN ? IMAGE_ORIGIN + encoded : encoded;
  } catch {
    try {
      const encoded = encodeURI(url);
      return IMAGE_ORIGIN ? IMAGE_ORIGIN + encoded : encoded;
    } catch {
      return IMAGE_ORIGIN ? IMAGE_ORIGIN + url : url;
    }
  }
}
