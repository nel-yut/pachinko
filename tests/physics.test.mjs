import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenericStLayout } from '../src/physics/layout.js';
import { PhysicsWorld } from '../src/physics/world.js';
import { deriveSeededRng } from '../src/core/rng.js';
import { runPhysicsReport } from '../src/verify/physicsReport.js';
import { GameSession } from '../src/game/session.js';
import { sampleSt } from '../src/presets/sample-st.js';

test('同一シード・同一強度で物理は決定的', () => {
  const run = () => { const w = new PhysicsWorld(buildGenericStLayout(), deriveSeededRng(9, 'p')); w.launch(1, 0.7); const ev = []; for (let i = 0; i < 6000 && w.balls.length; i++) ev.push(...w.step(1 / 120)); return JSON.stringify(ev); };
  assert.equal(run(), run());
});

test('左打ちと右打ちで異なる経路: 右打ちはゲートを通過し、左打ちは通過しにくい', () => {
  const r = runPhysicsReport({ seed: 2, ballsPerStrength: 150, strengths: [0.22, 0.75] });
  const [left, right] = r.rows;
  assert.ok(right.gate > left.gate * 2, `gate left=${left.gate} right=${right.gate}`);
  assert.ok(left.start1 > right.start1, `start1 left=${left.start1} right=${right.start1}`);
});

test('弱すぎる発射は戻り、玉は必ず終端イベントを1回だけ返す', () => {
  const r = runPhysicsReport({ seed: 3, ballsPerStrength: 100, strengths: [0, 0.5] });
  assert.equal(r.rows[0].return, 100);
  const row = r.rows[1];
  assert.equal(row.start1 + row.start2 + row.general + row.attacker + row.v + row.out + row.return, 100);
});

test('セッション: 発射→物理入賞→持ち玉・賞球が連動し、物理が抽選を行わない', () => {
  const cfg = structuredClone(sampleSt);
  const s = new GameSession(cfg, { machineRng: deriveSeededRng(4, 'm'), physicsRng: deriveSeededRng(4, 'p') });
  let lot = 0, launched = 0; s.machine.on('lottery', () => lot++); s.machine.on('launched', () => launched++);
  for (let i = 0; i < 20 * 60 * 30; i++) { s.tryFire(0.22); s.update(1000 / 60); }
  assert.ok(launched > 100);
  // 抽選は入賞時のみ: 抽選回数 = 有効始動口入賞数(保留満杯分は除く)
  assert.ok(lot <= s.machine.balls.launched);
  assert.ok(s.machine.balls.payoutTotal > 0);
  assert.equal(s.machine.balls.owned, cfg.balls.initial - s.machine.balls.launched + s.machine.balls.payoutTotal);
});
