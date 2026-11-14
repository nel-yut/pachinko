// 汎用盤面レイアウト（特定実機の配置を複製しない独自配置）。
// 座標系: x右・y下、単位は論理px。盤面 480x640。
// 機種設定 board.layout で選択し、params で部品座標・物理係数を調整できる。

export const DEFAULT_BOARD_PARAMS = {
  width: 480, height: 640,
  ballRadius: 4.5, pegRadius: 2.5,
  gravity: 1000,
  restitution: 0.45,         // 壁・釘の反発
  tangentDamping: 0.012,     // 接触ごとの接線方向減衰
  launch: { vMin: 1040, vMax: 1300, jitter: 0.006, fireIntervalMs: 600 }, // 初速(px/s)。強さ0..1で線形、jitter は初速の相対ゆらぎ
  rail: { cx: 240, cy: 250, R: 222, gap: 15, innerEndDeg: 125, laneBottom: 620, laneX: 18 },
  display: { x: 150, y: 130, w: 180, h: 160 },   // 中央の表示/役物エリア（玉は入らない）
  rightLaneX: 362,
  ports: {
    start1:   { x: 240, y: 524, w: 26, h: 10 },
    start2:   { x: 410, y: 482, w: 24, h: 10 },
    gate:     { x: 410, y: 372, w: 40, h: 8 },
    attacker: { x: 400, y: 600, w: 84, h: 12, vw: 14 },
    generalL: { x: 62, y: 585, w: 26, h: 12 },
    generalM: { x: 150, y: 560, w: 26, h: 12 },
    generalR: { x: 300, y: 560, w: 26, h: 12 },
  },
};

const rad = (d) => (d * Math.PI) / 180;

export function buildGenericStLayout(params = DEFAULT_BOARD_PARAMS) {
  const P = params, { cx, cy, R, gap, innerEndDeg, laneBottom, laneX } = P.rail;
  const walls = [];  // {a:[x,y], b:[x,y], tag?}
  const seg = (x1, y1, x2, y2, tag) => walls.push({ a: [x1, y1], b: [x2, y2], tag });
  const arc = (r, fromDeg, toDeg, tag, step = 3) => {
    const n = Math.max(2, Math.ceil(Math.abs(fromDeg - toDeg) / step));
    let px = cx + r * Math.cos(rad(fromDeg)), py = cy - r * Math.sin(rad(fromDeg));
    for (let i = 1; i <= n; i++) {
      const d = fromDeg + ((toDeg - fromDeg) * i) / n;
      const x = cx + r * Math.cos(rad(d)), y = cy - r * Math.sin(rad(d));
      seg(px, py, x, y, tag); px = x; py = y;
    }
  };
  const rightX = cx + R;
  // 外レール: 左レーン→天井アーク→右壁
  seg(laneX, laneBottom, laneX, cy, 'outer');
  arc(R, 180, 0, 'outer');
  seg(rightX, cy, rightX, P.height, 'outer');
  // 内レール: 左レーン→アーク（innerEndDeg で終端）。ここを過ぎた玉は盤面へ出る
  const innerX = laneX + gap;
  seg(laneX, laneBottom, innerX, laneBottom, 'laneFloor');
  seg(innerX, laneBottom, innerX, cy, 'inner');
  arc(R - gap, 180, innerEndDeg, 'inner');
  // 中央の表示エリア（演出役物の領域。物理的には障害物）
  const d = P.display;
  // 上辺は屋根形にして玉が乗って止まらないようにする
  seg(d.x, d.y + 16, d.x + d.w / 2, d.y, 'display'); seg(d.x + d.w / 2, d.y, d.x + d.w, d.y + 16, 'display');
  seg(d.x + d.w, d.y + 16, d.x + d.w, d.y + d.h, 'display');
  seg(d.x + d.w, d.y + d.h, d.x, d.y + d.h, 'display'); seg(d.x, d.y + d.h, d.x, d.y + 16, 'display');
  // 右上の偏向板（右壁を滑り落ちる玉を盤面内へ戻す）
  seg(rightX, 175, rightX - 34, 205, 'deflector');
  // 右打ち用の右レーン仕切り
  seg(P.rightLaneX, 300, P.rightLaneX, 560, 'rightLane');
  seg(P.rightLaneX - 22, 270, P.rightLaneX, 300, 'rightLane'); // 上部の呼び込み
  // 左側→中央の誘導
  seg(36, 400, 190, 468, 'guide');
  seg(36, 470, 120, 505, 'guide2');
  // 始動口1 の漏斗
  const s1 = P.ports.start1;
  seg(s1.x - 46, 480, s1.x - s1.w / 2, s1.y, 'funnel');
  seg(s1.x + 46, 480, s1.x + s1.w / 2, s1.y, 'funnel');
  // 始動口2(電チュー)の袖
  const s2 = P.ports.start2;
  seg(s2.x - 20, 462, s2.x - s2.w / 2, s2.y, 'denchuWing'); seg(s2.x + 20, 462, s2.x + s2.w / 2, s2.y, 'denchuWing');
  // アタッカーの袖
  const at = P.ports.attacker;
  seg(at.x - at.w / 2 - 22, 566, at.x - at.w / 2, at.y, 'attackerWing'); seg(at.x + at.w / 2 + 14, 566, at.x + at.w / 2, at.y, 'attackerWing');

  // 釘（格子状に生成し、部品・誘導壁に近いものは除く）
  const pegs = [];
  const keepOut = (x, y) => {
    if (x > d.x - 14 && x < d.x + d.w + 14 && y > d.y - 14 && y < d.y + d.h + 14) return true;
    for (const k of Object.values(P.ports)) if (Math.abs(x - k.x) < k.w / 2 + 16 && Math.abs(y - k.y) < 26) return true;
    return false;
  };
  const inside = (x, y) => {
    const dx = x - cx, dy = y - cy;
    if (y < cy && dx * dx + dy * dy > (R - 26) ** 2) return false; // 天井アーク付近
    return x > innerX + 12 && x < rightX - 7 && y > 70 && y < 540;
  };
  for (let row = 0, y = 100; y < 540; y += 24, row++) {
    for (let x = innerX + 16 + (row % 2) * 13; x < rightX - 6; x += 26) {
      if (!inside(x, y) || keepOut(x, y)) continue;
      pegs.push({ x, y, r: P.pegRadius });
    }
  }
  // 始動口1 まわりの寄せ釘（アタッカー側は広めに）
  for (const dx of [-30, -16, 16, 30]) pegs.push({ x: s1.x + dx, y: 498 - Math.abs(dx) * 0.2, r: P.pegRadius });

  // センサー: terminal=終端入賞、gate=通過のみ。requires は可動部品の状態条件。
  const rect = (k) => ({ x0: k.x - k.w / 2, x1: k.x + k.w / 2, y0: k.y, y1: k.y + k.h });
  const sensors = [
    { port: 'start1', ...rect(P.ports.start1) },
    { port: 'start2', ...rect(P.ports.start2), requires: 'denchuOpen' },
    { port: 'gate', gate: true, ...rect(P.ports.gate) },
    { port: 'general', id: 'generalL', ...rect(P.ports.generalL) },
    { port: 'general', id: 'generalM', ...rect(P.ports.generalM) },
    { port: 'general', id: 'generalR', ...rect(P.ports.generalR) },
    // アタッカー: 中央が V、左右が通常カウント。開放(閉鎖遅延中を含む)の間だけ入賞可
    { port: 'v', ...rect({ x: at.x, y: at.y, w: at.vw, h: at.h }), requires: 'attackerOpen' },
    { port: 'attacker', ...rect({ x: at.x - (at.vw + (at.w - at.vw) / 2) / 2, y: at.y, w: (at.w - at.vw) / 2, h: at.h }), requires: 'attackerOpen' },
    { port: 'attacker', ...rect({ x: at.x + (at.vw + (at.w - at.vw) / 2) / 2, y: at.y, w: (at.w - at.vw) / 2, h: at.h }), requires: 'attackerOpen' },
  ];
  // 可動カバー（閉じている時だけ衝突する）
  const covers = [
    { tag: 'denchuCover', closedWhen: 'denchuOpen', a: [s2.x - s2.w / 2 - 2, s2.y - 1], b: [s2.x + s2.w / 2 + 2, s2.y - 1] },
    { tag: 'attackerCover', closedWhen: 'attackerOpen', a: [at.x - at.w / 2, at.y - 1], b: [at.x + at.w / 2, at.y - 1] },
  ];
  return { width: P.width, height: P.height, walls, pegs, sensors, covers, params: P };
}

export const LAYOUTS = { 'generic-st': buildGenericStLayout };
