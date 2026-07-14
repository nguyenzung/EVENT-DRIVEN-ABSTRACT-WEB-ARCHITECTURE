import { Board, Stone, Cell, BOARD_SIZE } from './contracts.js';

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    new Array<Cell>(BOARD_SIZE).fill(null)
  );
}

export function placeStone(board: Board, row: number, col: number, color: Stone): Board {
  const next = board.map(r => [...r] as Cell[]);
  next[row][col] = color;
  return next;
}

export function checkWin(board: Board, row: number, col: number, color: Stone): boolean {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let s = 1; s <= 4; s++) {
      const r = row + dr * s, c = col + dc * s;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== color) break;
      count++;
    }
    for (let s = 1; s <= 4; s++) {
      const r = row - dr * s, c = col - dc * s;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== color) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

export function checkDraw(board: Board): boolean {
  return board.every(row => row.every(cell => cell !== null));
}

export function printBoard(board: Board): string {
  const cols = Array.from({ length: BOARD_SIZE }, (_, i) => i.toString().padStart(2)).join('');
  const header = `   ${cols}`;
  const rows = board.map((row, r) => {
    const cells = row.map(c => c === 'B' ? ' ●' : c === 'W' ? ' ○' : ' ·').join('');
    return `${r.toString().padStart(2)} ${cells}`;
  });
  return [header, ...rows].join('\n');
}
