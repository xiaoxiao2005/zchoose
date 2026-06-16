/**
 * 短促 UI 点击音（Web Audio，无需静态资源）。
 */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export function playUiClickSound(): void {
  try {
    const ctx = getCtx();
    void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.075);
  } catch {
    /* 忽略 */
  }
}

const CLICKABLE_SELECTOR = [
  'button',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="file"]',
  'a[href]',
  'summary',
  'label',
  'select',
  '[data-click-sound]',
].join(', ');

/** 是否应对该次点击播放音效（用于 document 委托） */
export function shouldPlayClickSound(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-no-click-sound]')) return false;

  const el = target.closest(CLICKABLE_SELECTOR) as HTMLElement | null;
  if (!el) return false;

  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el instanceof HTMLInputElement && el.disabled) return false;
  if (el instanceof HTMLSelectElement && el.disabled) return false;
  if (el instanceof HTMLTextAreaElement && el.disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}
