// 高速モード: 盤面アニメーション・物理を省略し、通常遊技と同じ machine（抽選・保留・状態遷移・賞球）を
// 仮想時計で大量に回す。玉の到達は「到達モデル」(口ごとの整数重み) で与える。
// 到達モデルは物理の測定結果から設定する値であり、抽選確率とは別物として扱う。

import { PachinkoMachine } from '../core/machine.js';
import { deriveSeededRng } from '../core/rng.js';
import { StatsCollector } from './stats.js';

/** 到達モデル: 打ち分け(side)ごとに口の重み(合計 den)。*/
export const DEFAULT_REACH = {
  den: 1000,
  flightMs: [1800, 4200],           // 発射から確定までの時間(ms)。この間にシャッター状態が変わりうる→オーバー入賞
  left:  { start1: 70, general: 40, gate: 10, out: 880 },
  right: { start2: 90, general: 10, gate: 150, attacker: 400, v: 40, out: 310 }, // gate は通過後に別途確定する玉(ゲート通過→その後の行き先は out 扱い)
};

export function runFastSim(config, {
  seed = 1, maxLaunches = 100000, reach = DEFAULT_REACH, fireIntervalMs = 600,
  strategy = 'recommended', initialBalls = null, stopAtSpins = null,
} = {}) {
  const machineRng = deriveSeededRng(seed, 'machine');
  const reachRng = deriveSeededRng(seed, 'reach');
  const cfg = initialBalls == null ? config : { ...config, balls: { ...config.balls, initial: initialBalls } };
  const m = new PachinkoMachine(cfg, machineRng);
  const stats = new StatsCollector(m);
  const pending = []; // {at, id, side}
  const pickPort = (side) => {
    const tbl = reach[side]; let r = reachRng.nextInt(reach.den);
    for (const [k, w] of Object.entries(tbl)) { if (r < w) return k; r -= w; }
    return 'out';
  };
  let launches = 0, t = 0;
  const step = fireIntervalMs;
  const lo = reach.flightMs[0], span = reach.flightMs[1] - reach.flightMs[0];
  while (launches < maxLaunches) {
    if (stopAtSpins != null && stats.sp[1].spins + stats.sp[2].spins >= stopAtSpins) break;
    // 発射
    const side = strategy === 'left' ? 'left' : strategy === 'right' ? 'right' : m.recommendedSide();
    const id = m.launch();
    if (id == null && pending.length === 0) break; // 玉切れ
    if (id != null) {
      launches++;
      const sh = m.shutters();
      const port = pickPort(side);
      pending.push({ at: m.now + lo + reachRng.nextInt(span + 1), id, port, gate: port === 'gate' });
      void sh;
    }
    // 次の発射時刻まで: 確定を時刻順に処理しつつ時間を進める
    const target = m.now + step;
    pending.sort((a, b) => a.at - b.at);
    while (pending.length && pending[0].at <= target) {
      const p = pending.shift();
      m.advance(Math.max(0, p.at - m.now));
      const sh = m.shutters();
      let port = p.port;
      if (port === 'gate') { m.gatePassed(p.id); port = 'out'; }
      if ((port === 'attacker' || port === 'v') && !sh.attackerOpen) port = 'out'; // 閉鎖中は入れない
      if (port === 'v' && !sh.vOpen) port = 'attacker';                          // V非開放時は通常カウント扱い
      if (port === 'start2' && !sh.denchuOpen) port = 'out';
      m.ballEntered(p.id, port);
    }
    m.advance(Math.max(0, target - m.now));
    t = m.now;
  }
  // 残りの玉と進行中の遊技を消化
  pending.sort((a, b) => a.at - b.at);
  for (const p of pending) { m.advance(Math.max(0, p.at - m.now)); m.ballEntered(p.id, 'out'); }
  stats.finish();
  return { machine: m, stats, simMs: t, launches, seed };
}
