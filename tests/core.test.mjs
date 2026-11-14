import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRng, createSecureRng } from '../src/core/rng.js';
import { drawProbability, pickWeighted } from '../src/core/lottery.js';
import { validateConfig } from '../src/core/config-validate.js';
import { sampleSt } from '../src/presets/sample-st.js';
import { eva15 } from '../src/presets/eva15.js';
import { runFastSim } from '../src/verify/fastsim.js';
import { runLotteryMC } from '../src/verify/lotteryMC.js';
import { runRules } from '../src/verify/rules.js';

test('当落は整数境界で判定: 205/65536 は 乱数値 0..204 が当たり、205 以上が外れ', () => {
  const stub = (v) => ({ nextInt: () => v });
  assert.equal(drawProbability(stub(0), 205, 65536), true);
  assert.equal(drawProbability(stub(204), 205, 65536), true);
  assert.equal(drawProbability(stub(205), 205, 65536), false);
  assert.equal(drawProbability(stub(65535), 205, 65536), false);
  assert.throws(() => drawProbability(stub(0), 1, 0));
  assert.throws(() => drawProbability(stub(0), 2.5, 10));
});

test('シード付き乱数は再現可能・範囲内、本番用乱数は範囲内', () => {
  const a = createSeededRng('x'), b = createSeededRng('x'), c = createSeededRng('y');
  const sa = Array.from({ length: 50 }, () => a.nextInt(65536)), sb = Array.from({ length: 50 }, () => b.nextInt(65536));
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, Array.from({ length: 50 }, () => c.nextInt(65536)));
  const s = createSecureRng();
  for (let i = 0; i < 1000; i++) { const v = s.nextInt(7); assert.ok(v >= 0 && v < 7); }
});

test('振分は整数重みで境界どおり', () => {
  const e = [{ type: 'a', weight: 60 }, { type: 'b', weight: 40 }];
  const at = (v) => pickWeighted({ nextInt: () => v }, e, 100).type;
  assert.deepEqual([at(0), at(59), at(60), at(99)], ['a', 'a', 'b', 'b']);
});

test('サンプル台は検証を通り、エヴァ15プリセットは未確定値で遊技開始不可', () => {
  assert.equal(validateConfig(sampleSt).length, 0);
  const v = validateConfig(eva15);
  assert.ok(v.some((i) => i.level === 'unconfirmed'));
  assert.ok(!v.some((i) => i.level === 'error'), JSON.stringify(v.filter((i) => i.level === 'error')));
});

test('エヴァ15プリセットの確定値は設計書記載のものだけ（205/65536 を内部乱数として登録しない）', () => {
  assert.equal(eva15.reference.stSpins, 163);
  assert.equal(eva15.reference.jitanSpins, 100);
  assert.equal(eva15.reference.sp2PayoutNominal, 1500);
  assert.equal(eva15.lottery.den, null);
  assert.equal(eva15.lottery.low[1], null);
});

test('ルール検証が全件PASS', () => {
  const r = runRules();
  const ng = r.filter((x) => !x.pass);
  assert.equal(ng.length, 0, JSON.stringify(ng, null, 1));
});

test('抽選の統計: 実測が理論値と整合 (|z|<5)', () => {
  const r = runLotteryMC(sampleSt, { seed: 11, draws: 400000 });
  for (const row of r.rows) assert.ok(Math.abs(row.z) < 5, `sp${row.sp} ${row.mode} z=${row.z}`);
  for (const row of r.rows) for (const d of row.dist) assert.ok(Math.abs(d.z) < 5);
});

test('高速試行は同一シードで再現し、通常遊技と同じ machine を通る', () => {
  const run = (seed) => { const s = runFastSim(sampleSt, { seed, maxLaunches: 30000, initialBalls: 100000 }); return JSON.stringify([s.stats.jackpots, s.stats.payoutTotal, s.stats.sp[1].entries, s.stats.origin]); };
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
  const s = runFastSim(sampleSt, { seed: 5, maxLaunches: 30000, initialBalls: 100000 });
  assert.equal(s.stats.duplicate, 0);
});
