import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Splash.css';

type Phase = 'black' | 'brighten' | 'hold' | 'fadeout';

const TIMING = {
  soundFirst: 1000,   // 音乐先播放 1 秒，再出文字
  brighten: 500,
  hold: 1200,
  fadeout: 400,
};

/** 启动音效：public/sounds/startup.mp3，先播 1 秒后出字 */
const STARTUP_SOUND_URL = '/sounds/startup.mp3';

export default function Splash() {
  const [phase, setPhase] = useState<Phase>('black');
  const [started, setStarted] = useState(false); // 需用户点击后再播音效（浏览器自动播放策略）
  const navigate = useNavigate();
  const soundPlayed = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 进入页面即预加载音效
  useEffect(() => {
    try {
      const audio = new Audio(STARTUP_SOUND_URL);
      audio.volume = 0.7;
      audio.preload = 'auto';
      audio.load();
      audio.addEventListener('error', () => {
        console.warn('[Splash] 启动音效加载失败，请将 startup.mp3 放入 public/sounds/');
      });
      audioRef.current = audio;
      return () => {
        audioRef.current = null;
      };
    } catch {
      audioRef.current = null;
    }
  }, []);

  // 用户点击后：播音效 + 启动时间线
  useEffect(() => {
    if (!started) return;
    const t0 = setTimeout(() => {
      if (!soundPlayed.current && audioRef.current) {
        soundPlayed.current = true;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((e) => {
          console.warn('[Splash] 音效播放被拦截（需用户交互）:', e);
        });
      }
    }, 0);
    const t1 = setTimeout(() => setPhase('brighten'), TIMING.soundFirst);
    const t2 = setTimeout(() => setPhase('hold'), TIMING.soundFirst + TIMING.brighten);
    const t3 = setTimeout(
      () => setPhase('fadeout'),
      TIMING.soundFirst + TIMING.brighten + TIMING.hold
    );
    const t4 = setTimeout(
      () => navigate('/home', { replace: true }),
      TIMING.soundFirst + TIMING.brighten + TIMING.hold + TIMING.fadeout
    );
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [started, navigate]);

  const handleStart = () => {
    if (!started) setStarted(true);
  };

  return (
    <div
      className={`splash splash--${phase}`}
      role="presentation"
      aria-label="Zchoose 启动中"
      onClick={handleStart}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStart(); }}
      tabIndex={0}
    >
      <div className="splash__bg" />
      {!started && (
        <p className="splash__hint">点击屏幕开始</p>
      )}
      <span className="splash__logo">Zchoose</span>
    </div>
  );
}
