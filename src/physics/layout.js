// 汎用盤面レイアウト v2（特定実機の配置は複製しない独自配置）。座標系: x右・y下、盤面 480x640。
// 構成: 外レール/内レール、中央液晶枠(屋根・左側面のワープ入口・ステージ)、風車×3、ヘソ(特図1)+命釘+寄せ釘、
//       ゲート(チェッカー)→電チュー(特図2・開閉ウイング)、一般入賞口(袖/肩/ベース)、アタッカー(開閉扉・V)、アウト口。
// 部品座標・釘は params で上書き可能。

export const DEFAULT_BOARD_PARAMS = {
  width: 480, height: 640,
  ballRadius: 4.5, pegRadius: 2.2,
  gravity: 1000,
  restitution: 0.45,
  tangentDamping: 0.003,
  launch: { vMin: 1010, vMax: 1300, curve: [[0, 1010], [0.45, 1100], [1, 1300]], jitter: 0.006, fireIntervalMs: 600 },
  rail: { cx: 240, cy: 250, R: 222, gap: 15, innerEndDeg: 125, laneBottom: 620, laneX: 18 },
  lcd: { x: 118, y: 100, w: 244, h: 198 },              // 液晶枠(外形)。玉は入らない
  stage: { y: 292, holeW: 17 },                          // ステージ床の高さと中央の穴幅
  warp: { x0: 104, x1: 115, y: 176 },                    // ワープ入口(液晶枠の左側面。斜めの受けに乗った玉が入る)
  rightLaneX: 364,
  windmills: [{ x: 80, y: 232, r: 18, blades: 3 }, { x: 410, y: 214, r: 17, blades: 3 }, { x: 240, y: 408, r: 15, blades: 4 }],
  ports: {
    start1: { x: 240, y: 524, w: 24, h: 10 },
    start2: { x: 412, y: 488, w: 22, h: 10 },
    gate: { x: 412, y: 352, w: 30, h: 8 },
    attacker: { x: 398, y: 592, w: 84, h: 12, vw: 14 },
    generals: [
      { id: 'shoulderL', x: 66, y: 300 }, { id: 'sleeveL', x: 64, y: 456 }, { id: 'baseL', x: 100, y: 592 },
      { id: 'baseML', x: 182, y: 594 }, { id: 'baseMR', x: 298, y: 594 }, { id: 'sleeveR', x: 430, y: 450 },
    ],
  },
};

const rad = (d) => (d * Math.PI) / 180;

export function buildGenericStLayout(params = DEFAULT_BOARD_PARAMS) {
  const P = params, { cx, cy, R, gap, innerEndDeg, laneBottom, laneX } = P.rail;
  const walls = [], pegs = [];
  const seg = (x1, y1, x2, y2, tag) => walls.push({ a: [x1, y1], b: [x2, y2], tag });
  const arc = (r, fromDeg, toDeg, tag, step = 3) => {
    const n = Math.max(2, Math.ceil(Math.abs(fromDeg - toDeg) / step));
    let px = cx + r * Math.cos(rad(fromDeg)), py = cy - r * Math.sin(rad(fromDeg));
    for (let i = 1; i <= n; i++) {
      const d = fromDeg + ((toDeg - fromDeg) * i) / n, x = cx + r * Math.cos(rad(d)), y = cy - r * Math.sin(rad(d));
      seg(px, py, x, y, tag); px = x; py = y;
    }
  };
  const rightX = cx + R, innerX = laneX + gap;
  // --- レール ---
  seg(laneX, laneBottom, laneX, cy, 'outer'); arc(R, 180, 0, 'outer'); seg(rightX, cy, rightX, P.height, 'outer');
  seg(laneX, laneBottom, innerX, laneBottom, 'laneFloor'); seg(innerX, laneBottom, innerX, cy, 'inner'); arc(R - gap, 180, innerEndDeg, 'inner');
  seg(rightX, 178, rightX - 34, 208, 'deflector');                 // 右壁を滑り落ちる玉を盤面へ戻す

  // --- 中央液晶枠・ワープ・ステージ ---
  const L = P.lcd, W = P.warp, S = P.stage, mid = L.x + L.w / 2;
  seg(L.x, L.y + 18, mid, L.y, 'lcd'); seg(mid, L.y, L.x + L.w, L.y + 18, 'lcd');            // 屋根
  seg(L.x + L.w, L.y + 18, L.x + L.w, S.y - 14, 'lcd'); seg(L.x, L.y + 18, L.x, S.y - 14, 'lcd');  // 左右の枠
  seg(W.x0 - 4, W.y - 10, W.x1 - 1, W.y - 4, 'warpRamp');                                    // ワープ入口の斜めの受け
  // ステージ床: 中央に穴。緩い凹形でうねり、穴へ落ちるか端へこぼれるかは玉の勢い次第
  const hx0 = mid - S.holeW / 2, hx1 = mid + S.holeW / 2;
  seg(L.x + 8, S.y - 2, 168, S.y + 3, 'stage'); seg(168, S.y + 3, hx0, S.y + 6, 'stage');
  seg(hx1, S.y + 6, 312, S.y + 3, 'stage'); seg(312, S.y + 3, L.x + L.w - 8, S.y - 2, 'stage');

  // --- 右レーン仕切り ---
  seg(P.rightLaneX, 300, P.rightLaneX, 470, 'rightLane'); seg(P.rightLaneX - 22, 272, P.rightLaneX, 300, 'rightLane');

  // --- 下部: ハカマ(アウト口への斜面) ---
  seg(34, 612, 196, 648, 'hakama'); seg(284, 648, 340, 620, 'hakama');

  // --- 釘 ---
  const nail = (x, y) => pegs.push({ x, y, r: P.pegRadius });
  const nearWall = (x, y) => walls.some((w) => w.tag !== 'outer' && w.tag !== 'inner' && distSeg(x, y, w.a, w.b) < P.ballRadius + P.pegRadius + 3);
  const inFree = (x, y) => {
    const dx = x - cx, dy = y - cy;
    if (y < cy && dx * dx + dy * dy > (R - 22) ** 2) return false;
    if (x < innerX + 14 || x > rightX - 7) return false;
    if (x > L.x - 12 && x < L.x + L.w + 12 && y > L.y - 12 && y < S.y + 24) return false;        // 液晶枠まわり
    for (const m of P.windmills) if (Math.hypot(x - m.x, y - m.y) < m.r + 12) return false;
    for (const k of [P.ports.start1, P.ports.start2, P.ports.gate, P.ports.attacker, ...P.ports.generals]) if (Math.abs(x - k.x) < (k.w || 22) / 2 + 20 && Math.abs(y - k.y) < 28) return false;
    return !nearWall(x, y);
  };
  const patch = (x0, x1, y0, y1, dx, dy) => {
    for (let r = 0, y = y0; y <= y1; y += dy, r++) for (let x = x0 + (r % 2) * (dx / 2); x <= x1; x += dx) if (inFree(x, y)) nail(x, y);
  };
  const line = (x1, y1, x2, y2, sp) => { const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / sp)); for (let i = 0; i <= n; i++) { const x = x1 + ((x2 - x1) * i) / n, y = y1 + ((y2 - y1) * i) / n; if (inFree(x, y)) nail(x, y); } };
  patch(150, 330, 58, 84, 30, 26);                                                                // 天井の散らし釘
  patch(46, 100, 132, 360, 21, 24);                                                               // 左ゾーン
  line(40, 300, 96, 372, 19); line(100, 372, 212, 466, 19);                                       // 左から中央へ流す「流れ釘」
  patch(376, 446, 110, 300, 22, 24);                                                              // 液晶右〜右打ち経路上部
  patch(110, 350, 336, 454, 26, 22);                                                              // 液晶下〜ヘソ手前
  line(352, 330, 268, 466, 19);                                                                   // 右から中央へ戻す流れ釘
  // ヘソ回り: 命釘(玉1個ぎりぎり)＋寄せ釘
  const hs = P.ports.start1, gapNail = 14.8;
  nail(hs.x - gapNail / 2, hs.y - 28); nail(hs.x + gapNail / 2, hs.y - 28);
  nail(hs.x - 24, hs.y - 20); nail(hs.x + 24, hs.y - 20); nail(hs.x - 36, hs.y - 36); nail(hs.x + 36, hs.y - 36);
  line(hs.x - 52, hs.y - 52, hs.x - 30, hs.y - 38, 14); line(hs.x + 52, hs.y - 52, hs.x + 30, hs.y - 38, 14);
  // 右打ちレーン: ゲート(チェッカー)支柱・散らし釘
  const gt = P.ports.gate;
  nail(gt.x - gt.w / 2 - 2, gt.y); nail(gt.x + gt.w / 2 + 2, gt.y);
  patch(372, 450, 312, 466, 22, 22);
  const dc = P.ports.start2;
  line(dc.x - 40, dc.y - 40, dc.x - 14, dc.y - 28, 14); line(dc.x + 40, dc.y - 40, dc.x + 14, dc.y - 28, 14);
  patch(372, 452, 512, 566, 24, 22);
  patch(60, 330, 548, 580, 28, 22);                                                               // 下部ベース
  line(rightX - 6, 330, rightX - 6, 420, 26);

  // --- 一般入賞口（袖・肩・ベース）: フード付きポケット ---
  const sensors = [];
  const rect = (k) => ({ x0: k.x - k.w / 2, x1: k.x + k.w / 2, y0: k.y, y1: k.y + k.h });
  for (const g of P.ports.generals) {
    seg(g.x - 10, g.y - 7, g.x - 9, g.y + 12, 'pocket'); seg(g.x + 10, g.y - 7, g.x + 9, g.y + 12, 'pocket');
    sensors.push({ port: 'general', id: g.id, ...rect({ x: g.x, y: g.y, w: 13, h: 10 }) });
  }
  seg(hs.x - hs.w / 2 - 3, hs.y - 6, hs.x - hs.w / 2, hs.y + hs.h, 'pocket'); seg(hs.x + hs.w / 2 + 3, hs.y - 6, hs.x + hs.w / 2, hs.y + hs.h, 'pocket');
  sensors.push({ port: 'start1', ...rect(hs) });
  sensors.push({ port: 'start2', ...rect(dc), requires: 'denchuOpen' });
  sensors.push({ port: 'gate', gate: true, ...rect({ x: gt.x, y: gt.y - 4, w: gt.w, h: gt.h }) });
  const at = P.ports.attacker, sideW = (at.w - at.vw) / 2;
  sensors.push({ port: 'v', ...rect({ x: at.x, y: at.y, w: at.vw, h: at.h }), requires: 'attackerOpen' });
  sensors.push({ port: 'attacker', ...rect({ x: at.x - at.vw / 2 - sideW / 2, y: at.y, w: sideW, h: at.h }), requires: 'attackerOpen' });
  sensors.push({ port: 'attacker', ...rect({ x: at.x + at.vw / 2 + sideW / 2, y: at.y, w: sideW, h: at.h }), requires: 'attackerOpen' });

  // --- 可動部品（開閉状態で形が変わる壁）。closed/open は同数の線分でペアにする（描画の補間用） ---
  const Z = (x, y) => ({ a: [x, y], b: [x, y] });
  // 閉じている時は屋根形にして、玉が乗って止まらず左右へ転がり落ちるようにする
  const roof = (k, hw) => [{ a: [k.x - hw, k.y + 3], b: [k.x, k.y - 4] }, { a: [k.x, k.y - 4], b: [k.x + hw, k.y + 3] }];
  const dynamics = [
    { id: 'denchu', key: 'denchuOpen',
      closed: [...roof(dc, dc.w / 2 + 16), Z(dc.x, dc.y), Z(dc.x, dc.y)],
      open: [Z(dc.x, dc.y), Z(dc.x, dc.y), { a: [dc.x - dc.w / 2 - 20, dc.y - 20], b: [dc.x - dc.w / 2, dc.y - 1] }, { a: [dc.x + dc.w / 2 + 20, dc.y - 20], b: [dc.x + dc.w / 2, dc.y - 1] }] },
    { id: 'attackerDoor', key: 'attackerOpen',
      closed: roof(at, at.w / 2 + 8),
      open: [{ a: [at.x - at.w / 2 - 14, at.y - 14], b: [at.x - at.w / 2, at.y - 1] }, { a: [at.x + at.w / 2 + 14, at.y - 14], b: [at.x + at.w / 2, at.y - 1] }] },
  ];
  const windmills = P.windmills.map((m, i) => ({ id: `wm${i}`, ...m }));
  return { width: P.width, height: P.height, walls, pegs, sensors, dynamics, windmills, params: P };
}

function distSeg(x, y, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], l2 = abx * abx + aby * aby;
  let t = l2 ? ((x - a[0]) * abx + (y - a[1]) * aby) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a[0] + abx * t), y - (a[1] + aby * t));
}

export const LAYOUTS = { 'generic-st': buildGenericStLayout };
