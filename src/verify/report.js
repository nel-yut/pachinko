// 検証レポートの組み立てと整形（CLI・verify.html 共通）。
import { runRules } from './rules.js';
import { runLotteryMC } from './lotteryMC.js';
import { runFastSim, DEFAULT_REACH } from './fastsim.js';
import { runPhysicsReport } from './physicsReport.js';
import { theory, binomCI, zScore } from './theory.js';
import { validateConfig } from '../core/config-validate.js';

const pct = (x, d = 3) => (x * 100).toFixed(d) + '%';
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function summarizeSim(config, sim) {
  const st = sim.stats, th = theory(config);
  const sp = {};
  for (const k of [1, 2]) {
    const s = st.sp[k], draws = s.byMode.low.draws + s.byMode.high.draws, hits = s.byMode.low.hits + s.byMode.high.hits;
    sp[k] = {
      validEntries: draws, rejectedFull: s.rejectedFull, spins: s.spins, hits,
      low: { draws: s.byMode.low.draws, hits: s.byMode.low.hits, theory: th.sp[k].low.value, measured: s.byMode.low.draws ? s.byMode.low.hits / s.byMode.low.draws : 0, z: zScore(s.byMode.low.hits, s.byMode.low.draws, th.sp[k].low.value) },
      high: { draws: s.byMode.high.draws, hits: s.byMode.high.hits, theory: th.sp[k].high.value, measured: s.byMode.high.draws ? s.byMode.high.hits / s.byMode.high.draws : 0, z: zScore(s.byMode.high.hits, s.byMode.high.draws, th.sp[k].high.value) },
      byType: s.byType,
    };
  }
  const first = st.origin.first;
  const stCont = st.stReset / Math.max(1, st.stReset + st.stHitNoReset + st.stExpired);
  const pay = st.jackpotPayouts, sorted = [...pay].sort((a, b) => a - b);
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  return {
    seed: sim.seed, launches: st.launched, simHours: sim.simMs / 3600000,
    balls: { launched: st.launched, returned: st.returned, startPorts: { start1: st.ports.start1, start2: st.ports.start2 }, general: st.ports.general, attacker: st.ports.attacker + st.ports.v, out: st.out, payout: st.payoutTotal, payoutByPort: st.payoutByPort, final: sim.machine.balls.owned },
    sp, jackpots: st.jackpots, origin: st.origin,
    stEntry: { firstHits: first, direct: st.firstDirectSt, directRate: first ? st.firstDirectSt / first : 0, chains: st.chains, chainsWithSt: st.chainsWithSt, totalRate: st.chains ? st.chainsWithSt / st.chains : 0, jitanReturn: st.origin.jitanReturn, holdReturn: st.origin.holdReturn },
    st: { starts: st.stStarts, reset: st.stReset, hitNoReset: st.stHitNoReset, expired: st.stExpired, continueRate: stCont, endRate: 1 - stCont, avgChainHits: mean(st.chainHits), chainCount: st.chainHits.length },
    v: { rounds: st.vRounds, success: st.vSuccess, rate: st.vRounds ? st.vSuccess / st.vRounds : 0 },
    rounds: st.rounds, over: { count: st.overCount, payout: st.overPayout, closedByCount: st.attackerClosedByCount, closedByTime: st.attackerClosedByTime },
    payoutPerJackpot: { n: pay.length, mean: mean(pay), min: sorted[0] ?? 0, p10: q(0.1), median: q(0.5), p90: q(0.9), max: sorted[sorted.length - 1] ?? 0 },
    integrity: { duplicateRejected: st.duplicate, invalidEntries: st.invalid, holdDiscarded: st.holdDiscarded },
  };
}

export function buildReport(config, { seed = 1, draws = 1_000_000, launches = 200000, ballsPerStrength = 300, reach = DEFAULT_REACH, includePhysics = true, onProgress = () => {} } = {}) {
  const t0 = Date.now();
  const issues = validateConfig(config);
  const rep = { generatedFrom: { profile: config.id, profileName: config.name, status: config.status, seed, draws, launches }, issues, theory: theory(config), config };
  if (issues.length) { rep.blocked = true; return rep; }
  onProgress('ルール検証'); rep.rules = runRules();
  onProgress('抽選の統計検証'); rep.lottery = runLotteryMC(config, { seed, draws });
  onProgress('遊技フロー高速試行'); const sim = runFastSim(config, { seed, maxLaunches: launches, reach, initialBalls: launches * 4 });
  rep.sim = summarizeSim(config, sim); rep.reach = reach;
  if (includePhysics) { onProgress('盤面物理'); rep.physics = runPhysicsReport({ seed, ballsPerStrength }); }
  rep.elapsedMs = Date.now() - t0;
  return rep;
}

export function formatReport(rep) {
  const L = [];
  const g = rep.generatedFrom;
  L.push(`# 検証レポート`, '', `- 設定プロファイル: ${g.profileName} (${g.profile}, status=${g.status})`, `- 乱数シード: ${g.seed}（再現可能な検証用乱数）`, `- 抽選試行数: ${g.draws.toLocaleString()} / 遊技フロー試行(発射数): ${g.launches.toLocaleString()}`);
  if (rep.blocked) {
    L.push('', '## 設定に問題があるため検証を実行できません', ...rep.issues.map((i) => `- [${i.level === 'unconfirmed' ? '未確定' : 'エラー'}] ${i.path}: ${i.message}`));
    return L.join('\n');
  }
  L.push('', '## 1. ルール検証 (設計書 §9.1)');
  for (const r of rep.rules) L.push(`- ${r.pass ? 'PASS' : '**FAIL**'} ${r.id} ${r.title}\n  - ${r.detail}`);
  L.push('', `ルール検証: ${rep.rules.filter((r) => r.pass).length}/${rep.rules.length} PASS`);

  L.push('', '## 2. 抽選の統計検証（始動口入賞後の当たり確率。盤面物理は無関係）', '', '| 特図 | 状態 | 試行 | 当たり | 理論値 | 実測値 | 95%区間(目安) | z |', '|---|---|---:|---:|---|---:|---|---:|');
  for (const r of rep.lottery.rows) L.push(`| 特図${r.sp} | ${r.mode === 'low' ? '低確率' : '高確率'} | ${r.draws.toLocaleString()} | ${r.hits.toLocaleString()} | ${r.theory.text} | ${pct(r.measured, 4)} | ${pct(r.ci95[0], 4)}〜${pct(r.ci95[1], 4)} | ${r.z.toFixed(2)} |`);
  L.push('', '当たり振分（理論 / 実測）:');
  for (const r of rep.lottery.rows) L.push(`- 特図${r.sp}/${r.mode === 'low' ? '低' : '高'}確率: ` + r.dist.map((d) => `${d.type} ${pct(d.theory, 1)} / ${pct(d.measured, 2)} (z=${d.z.toFixed(2)})`).join(', '));
  L.push('', '有限回の試行のため実測値は理論値と完全一致しない。|z| が概ね 4 以下なら統計的に整合。');

  const s = rep.sim;
  L.push('', '## 3. 遊技フロー高速試行（通常遊技と同じ machine を仮想時計で実行・物理は到達モデルで代替）', '',
    `- 発射 ${s.balls.launched.toLocaleString()} 球 / 仮想時間 ${s.simHours.toFixed(1)} 時間 / 乱数シード ${s.seed}`,
    `- 入賞: 特図1始動 ${s.balls.startPorts.start1}, 特図2始動 ${s.balls.startPorts.start2}, 一般 ${s.balls.general}, アタッカー(V含む) ${s.balls.attacker}, アウト ${s.balls.out}`,
    `- 総賞球 ${s.balls.payout.toLocaleString()} / 口別: ${JSON.stringify(s.balls.payoutByPort)}`,
    `- 到達モデル(別物): ${JSON.stringify(rep.reach)}`);
  for (const k of [1, 2]) {
    const p = s.sp[k];
    L.push(`- 特図${k}: 有効抽選 ${p.validEntries}（保留満杯で無効 ${p.rejectedFull}）, 変動 ${p.spins}, 当たり ${p.hits} / 低確率 ${p.low.hits}/${p.low.draws} (理論 ${pct(p.low.theory, 4)}, 実測 ${pct(p.low.measured, 4)}) / 高確率 ${p.high.hits}/${p.high.draws} (理論 ${pct(p.high.theory, 4)}, 実測 ${pct(p.high.measured, 4)}), 種別別 ${JSON.stringify(p.byType)}`);
  }
  L.push(`- 大当たり ${s.jackpots} 回（初当たり ${s.origin.first}, ST中 ${s.origin.stContinue}, 時短中の引き戻し ${s.origin.jitanReturn}, 残保留からの引き戻し ${s.origin.holdReturn}）`,
    `- ST突入率: 初当たり直行 ${s.stEntry.direct}/${s.stEntry.firstHits} = ${pct(s.stEntry.directRate, 2)}（V入賞成功のみ）, 時短・残保留込みトータル ${s.stEntry.chainsWithSt}/${s.stEntry.chains} = ${pct(s.stEntry.totalRate, 2)}`,
    `- V入賞: V開放ラウンド ${s.v.rounds} 回中 成功 ${s.v.success} (${pct(s.v.rate, 1)}) ← 盤面物理/到達モデルの結果であり抽選確率ではない`,
    `- ST: 突入 ${s.st.starts}, 継続(再設定) ${s.st.reset}, 当たってもST再設定なし ${s.st.hitNoReset}, 回数消化で終了 ${s.st.expired} → 継続率 ${pct(s.st.continueRate, 2)} / 終了率 ${pct(s.st.endRate, 2)}, 平均連チャン数(初当たり含む) ${s.st.avgChainHits.toFixed(2)} (${s.st.chainCount}連荘)`,
    `- 1大当たりの獲得賞球(アタッカー): 平均 ${s.payoutPerJackpot.mean.toFixed(0)}, 最小 ${s.payoutPerJackpot.min}, 10% ${s.payoutPerJackpot.p10}, 中央 ${s.payoutPerJackpot.median}, 90% ${s.payoutPerJackpot.p90}, 最大 ${s.payoutPerJackpot.max}`,
    `- オーバー入賞: ${s.over.count} 球 / 追加賞球 ${s.over.payout}（閉鎖: 規定数 ${s.over.closedByCount}, 時間 ${s.over.closedByTime}）`,
    `- 整合性: 重複確定の拒否 ${s.integrity.duplicateRejected}, 無効入賞 ${s.integrity.invalidEntries}, 破棄された保留 ${s.integrity.holdDiscarded}`, '',
    '| R | 回数 | 入賞数 | 入賞/回 | オーバー | 賞球 |', '|---:|---:|---:|---:|---:|---:|');
  for (const [r, v] of Object.entries(s.rounds)) L.push(`| ${r} | ${v.n} | ${v.count} | ${(v.count / v.n).toFixed(2)} | ${v.over} | ${v.payout} |`);
  L.push('', `ST継続率の理想値目安(保留効果を無視, 高確率N回で1回以上当たる確率): ${rep.theory.stHitWithin ? pct(rep.theory.stHitWithin.value, 2) + ` (N=${rep.theory.stHitWithin.spins})` : 'なし'}。実測はV入賞失敗・ST突入時の低確率保留により低くなる。`);

  if (rep.physics) {
    L.push('', '## 4. 盤面物理の検証（抽選とは別。発射強度ごとの到達率、シャッター閉鎖・電チュー閉鎖状態）', '', '| 強度 | 発射 | 戻り | 特図1始動 | 一般 | アウト | ゲート通過 | 始動口1到達率 | 一般入賞率 | アウト率 |', '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of rep.physics.rows) L.push(`| ${r.strength} | ${r.launched} | ${r.return} | ${r.start1} | ${r.general} | ${r.out} | ${r.gate} | ${pct(r.start1Rate, 1)} | ${pct(r.generalRate, 1)} | ${pct(r.outRate, 1)} |`);
    L.push('', '(戻り=発射レールを昇り切れず戻った玉。到達率は戻りを除いた発射数に対する割合。玉同士の衝突は未実装。)');
  }
  L.push('', `実行時間: ${rep.elapsedMs} ms`);
  return L.join('\n');
}
