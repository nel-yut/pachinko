// 盤面物理の検証: 発射強度ごとの 始動口到達率・一般入賞率・アウト率 など。
// 抽選確率とは無関係（ここでは machine を使わず物理だけを回す）。

import { buildGenericStLayout, DEFAULT_BOARD_PARAMS } from '../physics/layout.js';
import { PhysicsWorld } from '../physics/world.js';
import { deriveSeededRng } from '../core/rng.js';

export function runPhysicsReport({ seed = 1, ballsPerStrength = 300, strengths = [0, 0.1, 0.15, 0.2, 0.22, 0.3, 0.4, 0.5, 0.6, 0.75, 1], params = DEFAULT_BOARD_PARAMS, shutters = { denchuOpen: false, attackerOpen: false } } = {}) {
  const layout = buildGenericStLayout(params);
  const rows = [];
  for (const s of strengths) {
    const w = new PhysicsWorld(layout, deriveSeededRng(seed, `phys-${s}`));
    w.setShutters(shutters);
    const res = { start1: 0, start2: 0, general: 0, attacker: 0, v: 0, out: 0, return: 0, gate: 0, stuck: 0 };
    for (let i = 0; i < ballsPerStrength; i++) w.launch(i + 1, s);
    for (let t = 0; t < 60 * 120 && w.balls.length; t++) {
      for (const e of w.step(1 / 120)) {
        if (e.type === 'port') res[e.port]++; else if (e.type === 'gate') res.gate++; else { res[e.type]++; if (e.stuck) res.stuck++; }
      }
    }
    const n = ballsPerStrength, shot = n - res.return;
    rows.push({ strength: s, launched: n, ...res, rate: (k) => (shot ? res[k] / shot : 0),
      start1Rate: shot ? res.start1 / shot : 0, start2Rate: shot ? res.start2 / shot : 0, generalRate: shot ? res.general / shot : 0,
      attackerRate: shot ? (res.attacker + res.v) / shot : 0, outRate: shot ? res.out / shot : 0, gateRate: shot ? res.gate / shot : 0, returnRate: res.return / n });
  }
  return { seed, shutters, rows: rows.map(({ rate, ...r }) => r) };
}
