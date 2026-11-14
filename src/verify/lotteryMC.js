// 抽選の統計検証。実際の machine の入賞→抽選経路(_startEntry)を、時間を進めずに大量に通す。
// （時間を進めないので変動が終わらず、状態遷移の影響を受けずに「抽選そのもの」だけを測れる。）
// 盤面物理は一切使わない: ここで測るのは「始動口入賞後の当たり確率」のみ。

import { PachinkoMachine } from '../core/machine.js';
import { deriveSeededRng } from '../core/rng.js';
import { theory, zScore, binomCI } from './theory.js';

export function runLotteryMC(config, { seed = 1, draws = 1_000_000 } = {}) {
  const th = theory(config), rows = [];
  for (const sp of [1, 2]) for (const probMode of ['low', 'high']) {
    const cfg = structuredClone(config);
    const chunk = 50000; let done = 0, hits = 0; const byType = {};
    let idx = 0;
    while (done < draws) {
      const n = Math.min(chunk, draws - done);
      cfg.holds.max = { 1: n + 2, 2: n + 2 };
      const m = new PachinkoMachine(cfg, deriveSeededRng(seed, `mc-${sp}-${probMode}-${idx++}`));
      m.mode = probMode === 'high' ? 'st' : 'normal'; m.stLeft = 1e9;   // 検証用: 抽選時の状態だけを固定
      m.gate.denchuOpen = true; m.gate.denchuCount = -1e9;
      m.on('lottery', (e) => { if (e.hit) { hits++; byType[e.type] = (byType[e.type] || 0) + 1; } });
      for (let i = 0; i < n; i++) { const id = m.launch(); m.ballEntered(id, sp === 1 ? 'start1' : 'start2'); }
      done += n; cfg.balls.initial = n + 5;
    }
    const f = th.sp[sp][probMode];
    const z = zScore(hits, done, f.value), ci = binomCI(hits, done);
    // 振分
    const dist = Object.entries(th.sp[sp].dist).map(([type, w]) => {
      const c = byType[type] || 0, pExp = w;
      return { type, theory: pExp, measured: hits ? c / hits : 0, count: c, z: zScore(c, hits, pExp) };
    });
    rows.push({ sp, mode: probMode, draws: done, hits, theory: f, measured: ci.p, ci95: [ci.lo, ci.hi], z, dist });
  }
  return { seed, draws, rows };
}
