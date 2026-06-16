import { useState } from 'react';
import PuzzleGame from './PuzzleGame';
import Match3Game from './Match3Game';
import './TryOnGames.css';

export type GameType = 'puzzle' | 'match3';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface TryOnGamePanelProps {
  outfitImageUrl: string | null;
  isGenerating?: boolean;
  countdownRemaining?: number;
  resultReadyToView?: boolean;
  onViewResult?: () => void;
}

export default function TryOnGamePanel({
  outfitImageUrl,
  isGenerating,
  countdownRemaining = 0,
  resultReadyToView,
  onViewResult,
}: TryOnGamePanelProps) {
  const [gameType, setGameType] = useState<GameType>('puzzle');

  return (
    <div className="tryon-games">
      {resultReadyToView ? (
        <div className="tryon-games__done">
          <p className="tryon-games__title">生成完成</p>
          <button type="button" className="tryon-games__view-btn" onClick={onViewResult}>
            查看
          </button>
        </div>
      ) : (
        <>
          <p className="tryon-games__title">
            {isGenerating ? '生成中，玩个小游戏吧～' : '等待时可玩个小游戏'}
          </p>
          {isGenerating && countdownRemaining > 0 && (
            <p className="tryon-games__countdown">预计剩余 {formatCountdown(countdownRemaining)}</p>
          )}
        </>
      )}
      {!resultReadyToView && (
        <>
          <div className="tryon-games__tabs">
            <button
              type="button"
              className={`tryon-games__tab ${gameType === 'puzzle' ? 'tryon-games__tab--active' : ''}`}
              onClick={() => setGameType('puzzle')}
            >
              数字九宫格
            </button>
            <button
              type="button"
              className={`tryon-games__tab ${gameType === 'match3' ? 'tryon-games__tab--active' : ''}`}
              onClick={() => setGameType('match3')}
            >
              消除小游戏
            </button>
          </div>
          <div className="tryon-games__content">
            {gameType === 'puzzle' && <PuzzleGame imageUrl={outfitImageUrl} />}
            {gameType === 'match3' && <Match3Game />}
          </div>
        </>
      )}
    </div>
  );
}
