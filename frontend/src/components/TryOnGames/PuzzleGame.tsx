import { useState, useEffect, useCallback } from 'react';
import './PuzzleGame.css';

const STORAGE_KEY = 'tryon-puzzle';

const LEVEL_CONFIG: Record<number, { size: number }> = {
  1: { size: 3 },
  2: { size: 3 },
};

function getNeighbors(size: number, index: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(index - size);
  if (row < size - 1) neighbors.push(index + size);
  if (col > 0) neighbors.push(index - 1);
  if (col < size - 1) neighbors.push(index + 1);
  return neighbors;
}

function shuffleTiles(size: number): number[] {
  const total = size * size;
  const emptyIndex = total - 1;
  const arr = Array.from({ length: total }, (_, i) => i);
  let empty = emptyIndex;
  for (let i = 0; i < 60; i++) {
    const neighbors = getNeighbors(size, empty);
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    [arr[empty], arr[next]] = [arr[next], arr[empty]];
    empty = next;
  }
  return arr;
}

function checkWin(tiles: number[]): boolean {
  return tiles.every((v, i) => v === i);
}

function saveState(level: number, maxLevel: number, tiles: number[] | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, maxLevel, tiles }));
  } catch {}
}

interface PuzzleGameProps {
  imageUrl?: string | null;
}

function getInitialPuzzleState(): { level: number; maxLevel: number; tiles: number[] } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { level: 1, maxLevel: 1, tiles: shuffleTiles(3) };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { level: 1, maxLevel: 1, tiles: shuffleTiles(3) };
    const data = JSON.parse(raw);
    const level = Math.max(1, Math.min(2, Number(data.level) || 1));
    const maxLevel = Math.max(1, Math.min(2, Number(data.maxLevel) || 1));
    const sz = LEVEL_CONFIG[level]?.size ?? 3;
    const total = sz * sz;
    const tilesData = Array.isArray(data.tiles) ? data.tiles : null;
    if (tilesData && tilesData.length === total && tilesData.every((n: number) => n >= 0 && n < total) && !checkWin(tilesData)) {
      return { level, maxLevel, tiles: tilesData };
    }
    return { level, maxLevel, tiles: shuffleTiles(sz) };
  } catch {
    return { level: 1, maxLevel: 1, tiles: shuffleTiles(3) };
  }
}

export default function PuzzleGame(_props: PuzzleGameProps) {
  const initial = getInitialPuzzleState();
  const [level, setLevel] = useState(initial.level);
  const [maxLevel, setMaxLevel] = useState(initial.maxLevel);
  const [tiles, setTiles] = useState<number[]>(initial.tiles);
  const [won, setWon] = useState(false);

  const currentSize = LEVEL_CONFIG[level]?.size ?? 3;
  const total = currentSize * currentSize;
  const emptyIndex = total - 1;

  useEffect(() => {
    if (currentSize * currentSize !== tiles.length) {
      setTiles(shuffleTiles(currentSize));
      return;
    }
    if (checkWin(tiles)) setWon(true);
  }, [tiles, currentSize]);

  useEffect(() => {
    if (!won && tiles.length === currentSize * currentSize) {
      saveState(level, maxLevel, tiles);
    }
  }, [tiles, level, maxLevel, won, currentSize]);

  const handleClick = (clickedIndex: number) => {
    if (won) return;
    const emptyIdx = tiles.indexOf(emptyIndex);
    if (!getNeighbors(currentSize, emptyIdx).includes(clickedIndex)) return;
    const newTiles = [...tiles];
    newTiles[emptyIdx] = tiles[clickedIndex];
    newTiles[clickedIndex] = emptyIndex;
    setTiles(newTiles);
  };

  const resetSameLevel = () => {
    setWon(false);
    setTiles(shuffleTiles(currentSize));
    saveState(level, maxLevel, null);
  };

  const goNextLevel = () => {
    if (level >= 2) {
      resetSameLevel();
      return;
    }
    setWon(false);
    const nextLevel = level + 1;
    setLevel(nextLevel);
    setMaxLevel((m) => Math.max(m, nextLevel));
    const nextSize = LEVEL_CONFIG[nextLevel]?.size ?? 3;
    setTiles(shuffleTiles(nextSize));
    saveState(nextLevel, Math.max(maxLevel, nextLevel), null);
  };

  const displayValue = (value: number) => {
    if (value === emptyIndex) return '';
    return value + 1;
  };

  return (
    <div className="puzzle-game">
      <p className="puzzle-game__hint">点击与空白相邻的数字移动，排成 1～{total - 1} 即过关</p>
      <p className="puzzle-game__level">等级 {level} / 2</p>
      <div
        className="puzzle-game__board"
        style={{
          gridTemplateColumns: `repeat(${currentSize}, 1fr)`,
          gridTemplateRows: `repeat(${currentSize}, 1fr)`,
          aspectRatio: '1',
          maxWidth: currentSize === 4 ? 180 : 200,
        }}
      >
        {tiles.map((value, index) => (
          <button
            key={`${index}-${value}`}
            type="button"
            className={`puzzle-game__tile ${value === emptyIndex ? 'puzzle-game__tile--empty' : ''}`}
            onClick={() => handleClick(index)}
          >
            {displayValue(value)}
          </button>
        ))}
      </div>
      {won && (
        <div className="puzzle-game__won">
          <span>过关！</span>
          <div className="puzzle-game__won-actions">
            <button type="button" className="puzzle-game__again" onClick={resetSameLevel}>
              再玩一局
            </button>
            {level < 2 && (
              <button type="button" className="puzzle-game__again" onClick={goNextLevel}>
                下一关
              </button>
            )}
          </div>
        </div>
      )}
      {!won && (
        <div className="puzzle-game__actions">
          <button type="button" className="puzzle-game__reset" onClick={resetSameLevel}>
            重新打乱
          </button>
        </div>
      )}
    </div>
  );
}
