import { useEffect } from 'react';
import { playUiClickSound, shouldPlayClickSound } from '../utils/uiClickSound';

/**
 * 在 document 上委托 pointerdown：为常见可点击控件播放统一短促音效。
 * 某处不需要时可在祖先节点加 data-no-click-sound；自定义可点击区域可加 data-click-sound。
 */
export default function GlobalClickSound() {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!shouldPlayClickSound(e.target)) return;
      playUiClickSound();
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, []);
  return null;
}
