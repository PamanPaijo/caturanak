// chess.js — keadaan papan + gerak bidak (disederhanakan untuk anak).
// Tidak ada deteksi skak/skakmat. Menang = menangkap Raja lawan.
// color: 'l' (terang, pemain bawah, jalan ke atas/baris berkurang)
//        'd' (gelap, atas, jalan ke bawah/baris bertambah)

import { PIECE_VALUE } from './pieces.js';

export function startPosition() {
  const back = ['benteng', 'kuda', 'gajah', 'ratu', 'raja', 'gajah', 'kuda', 'benteng'];
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'd' };
    b[1][c] = { type: 'pion', color: 'd' };
    b[6][c] = { type: 'pion', color: 'l' };
    b[7][c] = { type: back[c], color: 'l' };
  }
  return b;
}

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function slide(b, r, c, dirs, color, out) {
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inside(nr, nc)) {
      const t = b[nr][nc];
      if (!t) { out.push([nr, nc]); }
      else { if (t.color !== color) out.push([nr, nc]); break; }
      nr += dr; nc += dc;
    }
  }
}

// Gerak pseudo-legal untuk satu bidak di (r,c).
export function legalMoves(b, r, c) {
  const p = b[r][c];
  if (!p) return [];
  const out = [];
  const color = p.color;
  if (p.type === 'pion') {
    const dir = color === 'l' ? -1 : 1;
    const startRow = color === 'l' ? 6 : 1;
    if (inside(r + dir, c) && !b[r + dir][c]) {
      out.push([r + dir, c]);
      if (r === startRow && !b[r + 2 * dir][c]) out.push([r + 2 * dir, c]);
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (inside(nr, nc) && b[nr][nc] && b[nr][nc].color !== color) out.push([nr, nc]);
    }
  } else if (p.type === 'kuda') {
    const j = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of j) {
      const nr = r + dr, nc = c + dc;
      if (inside(nr, nc) && (!b[nr][nc] || b[nr][nc].color !== color)) out.push([nr, nc]);
    }
  } else if (p.type === 'raja') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (inside(nr, nc) && (!b[nr][nc] || b[nr][nc].color !== color)) out.push([nr, nc]);
    }
  } else if (p.type === 'benteng') {
    slide(b, r, c, [[-1,0],[1,0],[0,-1],[0,1]], color, out);
  } else if (p.type === 'gajah') {
    slide(b, r, c, [[-1,-1],[-1,1],[1,-1],[1,1]], color, out);
  } else if (p.type === 'ratu') {
    slide(b, r, c, [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]], color, out);
  }
  return out;
}

// Menjalankan langkah, mengembalikan bidak yang tertangkap (atau null).
export function applyMove(b, fr, fc, tr, tc) {
  const captured = b[tr][tc];
  b[tr][tc] = b[fr][fc];
  b[fr][fc] = null;
  // promosi pion sederhana -> ratu
  const p = b[tr][tc];
  if (p && p.type === 'pion' && (tr === 0 || tr === 7)) p.type = 'ratu';
  return captured;
}

export function findKing(b, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (p && p.type === 'raja' && p.color === color) return [r, c];
  }
  return null;
}

// AI sangat sederhana: utamakan tangkapan bernilai tertinggi, selain itu acak.
export function pickAiMove(b, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p || p.color !== color) continue;
    for (const [tr, tc] of legalMoves(b, r, c)) {
      const target = b[tr][tc];
      const gain = target ? PIECE_VALUE[target.type] : 0;
      moves.push({ fr: r, fc: c, tr, tc, gain });
    }
  }
  if (!moves.length) return null;
  const maxGain = Math.max(...moves.map(m => m.gain));
  const best = moves.filter(m => m.gain === maxGain);
  // sedikit acak supaya tidak monoton
  if (maxGain === 0) return moves[Math.floor(Math.random() * moves.length)];
  return best[Math.floor(Math.random() * best.length)];
}
