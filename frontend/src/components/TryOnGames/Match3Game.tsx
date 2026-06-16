import { useState, useCallback, useEffect } from 'react';
import './Match3Game.css';

const STORAGE_KEY = 'tryon-match3';
const COLORS = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa'];
const MIN_MATCH = 3;
const MAX_LEVEL = 1000;

/** 等级 n 达到该得分即可进入等级 n+1（公式：每级 20 分） */
function getScoreThresholdForLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return level * 20;
}

/** 根据等级返回棋盘大小（6～9） */
function getSizeForLevel(level: number): number {
  if (level <= 250) return 6;
  if (level <= 500) return 7;
  if (level <= 750) return 8;
  return 9;
}

function createGrid(size: number): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < size; r++) {
    grid[r] = [];
    for (let c = 0; c < size; c++) {
      grid[r][c] = Math.floor(Math.random() * COLORS.length);
    }
  }
  return grid;
}

function findMatches(grid: number[][], rows: number, cols: number): { r: number; c: number }[] {
  const matched = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = grid[r][c];
      if (color < 0) continue;
      let countH = 1;
      let cc = c + 1;
      while (cc < cols && grid[r][cc] === color) { countH++; cc++; }
      cc = c - 1;
      while (cc >= 0 && grid[r][cc] === color) { countH++; cc--; }
      if (countH >= MIN_MATCH) {
        for (let i = c - (countH - 1); i <= c + (countH - 1); i++) if (i >= 0 && i < cols) matched.add(`${r},${i}`);
      }
      let countV = 1;
      let rr = r + 1;
      while (rr < rows && grid[rr][c] === color) { countV++; rr++; }
      rr = r - 1;
      while (rr >= 0 && grid[rr][c] === color) { countV++; rr--; }
      if (countV >= MIN_MATCH) {
        for (let i = r - (countV - 1); i <= r + (countV - 1); i++) if (i >= 0 && i < rows) matched.add(`${i},${c}`);
      }
    }
  }
  return Array.from(matched).map((s) => {
    const [r, c] = s.split(',').map(Number);
    return { r, c };
  });
}

function removeAndDrop(grid: number[][], rows: number, cols: number): number[][] {
  const next = grid.map((row) => [...row]);
  const matched = findMatches(next, rows, cols);
  if (matched.length === 0) return next;
  matched.forEach(({ r, c }) => { next[r][c] = -1; });
  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    for (let r = rows - 1; r >= 0; r--) if (next[r][c] >= 0) col.push(next[r][c]);
    while (col.length < rows) col.push(Math.floor(Math.random() * COLORS.length));
    for (let r = rows - 1; r >= 0; r--) next[r][c] = col[rows - 1 - r];
  }
  return next;
}

function resolveAll(grid: number[][], rows: number, cols: number): number[][] {
  let g = grid.map((row) => [...row]);
  for (let i = 0; i < 25; i++) {
    const m = findMatches(g, rows, cols);
    if (m.length === 0) break;
    m.forEach(({ r, c }) => { g[r][c] = -1; });
    for (let c = 0; c < cols; c++) {
      const col: number[] = [];
      for (let r = rows - 1; r >= 0; r--) if (g[r][c] >= 0) col.push(g[r][c]);
      while (col.length < rows) col.push(Math.floor(Math.random() * COLORS.length));
      for (let r = rows - 1; r >= 0; r--) g[r][c] = col[rows - 1 - r];
    }
  }
  return g;
}

function loadSaved(): { level: number; maxLevel: number; score: number; grid: number[][] | null } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { level: 1, maxLevel: 1, score: 0, grid: null };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { level: 1, maxLevel: 1, score: 0, grid: null };
    const data = JSON.parse(raw);
    const level = Math.max(1, Math.min(MAX_LEVEL, Number(data.level) || 1));
    const maxLevel = Math.max(1, Math.min(MAX_LEVEL, Number(data.maxLevel) || 1));
    const score = Math.max(0, Number(data.score) || 0);
    const grid = Array.isArray(data.grid) ? data.grid : null;
    const size = getSizeForLevel(level);
    if (grid && grid.length === size && grid.every((row: unknown) => Array.isArray(row) && (row as number[]).length === size)) {
      const valid = (grid as number[][]).every((row) => row.every((c) => c >= 0 && c < COLORS.length));
      if (valid) return { level, maxLevel, score, grid: grid as number[][] };
    }
    return { level, maxLevel, score, grid: null };
  } catch {
    return { level: 1, maxLevel: 1, score: 0, grid: null };
  }
}

function saveState(level: number, maxLevel: number, score: number, grid: number[][]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, maxLevel, score, grid }));
  } catch {}
}

export default function Match3Game() {
  const saved = loadSaved();
  const size = getSizeForLevel(saved.level);

  const [level, setLevel] = useState(saved.level);
  const [maxLevel, setMaxLevel] = useState(saved.maxLevel);
  const [grid, setGrid] = useState<number[][]>(() => {
    if (saved.grid && saved.grid.length === size) return saved.grid;
    return resolveAll(createGrid(size), size, size);
  });
  const [score, setScore] = useState(saved.score);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);

  const currentSize = getSizeForLevel(level);

  useEffect(() => {
    if (grid.length !== currentSize || (grid[0]?.length ?? 0) !== currentSize) {
      setGrid(resolveAll(createGrid(currentSize), currentSize, currentSize));
    }
  }, [level, currentSize]);

  useEffect(() => {
    saveState(level, maxLevel, score, grid);
  }, [level, maxLevel, score, grid]);

  const isAdjacent = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
  }, []);

  const swap = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    setGrid((g) => {
      const next = g.map((row) => [...row]);
      next[r1][c1] = g[r2][c2];
      next[r2][c2] = g[r1][c1];
      const after = removeAndDrop(next, currentSize, currentSize);
      const matchCount = findMatches(next, currentSize, currentSize).length;
      if (matchCount > 0) setScore((s) => s + matchCount);
      return after;
    });
    setSelected(null);
  }, [currentSize]);

  const handleCell = useCallback(
    (r: number, c: number) => {
      if (selected) {
        if (selected.r === r && selected.c === c) {
          setSelected(null);
          return;
        }
        if (isAdjacent(selected.r, selected.c, r, c)) {
          swap(selected.r, selected.c, r, c);
          return;
        }
        setSelected({ r, c });
        return;
      }
      setSelected({ r, c });
    },
    [selected, isAdjacent, swap]
  );

  // 分数达到阈值后自动升级（最高 1000 级）
  useEffect(() => {
    let nextLevel = level;
    while (nextLevel < MAX_LEVEL && score >= getScoreThresholdForLevel(nextLevel)) {
      nextLevel += 1;
    }
    if (nextLevel !== level) {
      setLevel(nextLevel);
    }
    setMaxLevel((m) => Math.max(m, nextLevel));
  }, [score, level]);

  const changeLevel = (newLevel: number) => {
    if (newLevel < 1 || newLevel > MAX_LEVEL || newLevel > maxLevel) return;
    setLevel(newLevel);
    setMaxLevel((m) => Math.max(m, newLevel));
    const s = getSizeForLevel(newLevel);
    setGrid(resolveAll(createGrid(s), s, s));
    setSelected(null);
  };

  return (
    <div className="match3-game">
      <p className="match3-game__hint">点击相邻两个方块交换，三个及以上同色连成一线即可消除</p>
      <div className="match3-game__meta">
        <span className="match3-game__score">得分：{score}</span>
        <span className="match3-game__level">等级 {level} / {MAX_LEVEL}</span>
      </div>
      <p className="match3-game__thresholds">
        {level < MAX_LEVEL && getScoreThresholdForLevel(level) > 0 && (
          <>达到 <strong>{getScoreThresholdForLevel(level)} 分</strong> 可进入等级 {level + 1}</>
        )}
        {level === MAX_LEVEL && '已是最高等级'}
      </p>
      <div className="match3-game__level-select">
        <button
          type="button"
          className="match3-game__level-btn"
          onClick={() => changeLevel(level - 1)}
          disabled={level <= 1}
          title="上一级"
        >
          －
        </button>
        <span className="match3-game__level-current">{level}</span>
        <button
          type="button"
          className="match3-game__level-btn"
          onClick={() => changeLevel(level + 1)}
          disabled={level >= maxLevel || level >= MAX_LEVEL}
          title="下一级"
        >
          ＋
        </button>
      </div>
      <div
        className="match3-game__board"
        style={{
          gridTemplateColumns: `repeat(${currentSize}, 1fr)`,
          gridTemplateRows: `repeat(${currentSize}, 1fr)`,
          maxWidth: currentSize === 9 ? 260 : currentSize === 8 ? 240 : currentSize === 7 ? 210 : 220,
        }}
      >
        {grid.map((row, r) =>
          row.map((color, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={`match3-game__cell ${selected?.r === r && selected?.c === c ? 'match3-game__cell--selected' : ''}`}
              style={{ backgroundColor: COLORS[color] }}
              onClick={() => handleCell(r, c)}
            />
          ))
        )}
      </div>
    </div>
  );
}
