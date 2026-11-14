// ルール検証: 設計書 §9.1 の各項目を、台本どおりの入力で検証する。
// 乱数に依存する項目は確率を 0 または 分母と同値（必ず外れ/必ず当たり）にして決定的に検証し、
// 確率の統計的な一致は lotteryMC.js で別に検証する。

import { PachinkoMachine } from '../core/machine.js';
import { sampleSt } from '../presets/sample-st.js';
import { createSeededRng, countingRng } from '../core/rng.js';
import { validateConfig } from '../core/config-validate.js';
import { eva15 } from '../presets/eva15.js';
import { GameSession } from '../game/session.js';
import { deriveSeededRng } from '../core/rng.js';

const clone = (o) => structuredClone(o);
const NEVER = (cfg) => { cfg.lottery.low = { 1: 0, 2: 0 }; cfg.lottery.high = { 1: 0, 2: 0 }; return cfg; };
const ALWAYS = (cfg) => { const d = cfg.lottery.den; cfg.lottery.low = { 1: d, 2: d }; cfg.lottery.high = { 1: d, 2: d }; return cfg; };
const only = (cfg, type) => { cfg.distribution[1] = [{ type, weight: cfg.distribution.total }]; cfg.distribution[2] = [{ type, weight: cfg.distribution.total }]; return cfg; };

/** 玉を1発射して指定口へ確定させる */
function enter(m, port) {
  const id = m.launch(); if (id == null) throw new Error('no balls');
  return { id, r: m.ballEntered(id, port) };
}
function openDenchu(m) { m.gate.denchuOpen = true; }  // 検証用: 電チュー開放状態を直接作る（普図抽選は別項目）
function mk(cfg, seed = 1) { const rng = countingRng(createSeededRng(seed)); return { m: new PachinkoMachine(cfg, rng), rng }; }
/** 大当たりを開始させ、ラウンド1開放まで進める */
function intoRound1(cfg) {
  const { m, rng } = mk(only(ALWAYS(clone(cfg)), 'R10V'));
  enter(m, 'start1'); m.advance(cfg.spinMs[1].normal);
  m.advance(cfg.hitTypes.R10V.openingMs);
  return { m, rng };
}

export const RULES = [
  { id: 'R01', title: '1回の有効始動口入賞で抽選が1回だけ行われる（発射・変動・演出では抽選しない）', run() {
    const cfg = NEVER(clone(sampleSt)); const { m, rng } = mk(cfg);
    for (let i = 0; i < 20; i++) m.launch();
    m.advance(100000);
    const idle = rng.calls;
    let lot = 0; m.on('lottery', () => lot++);
    const { id } = enter(m, 'start1');
    void id;
    const after1 = rng.calls - idle;
    m.advance(100000);  // 変動・保留消化でも乱数を使わない
    const after2 = rng.calls - idle;
    return { pass: idle === 0 && after1 === 1 && after2 === 1 && lot === 1, detail: `発射のみ=${idle}回, 入賞1回(外れ)=${after1}回, 変動消化後=${after2}回, lotteryイベント=${lot}` };
  } },
  { id: 'R02', title: '右打ち等で発射しただけ・ゲート通過・アウトでは特図抽選が発生しない', run() {
    const cfg = clone(sampleSt); const { m } = mk(cfg);
    let lot = 0; m.on('lottery', () => lot++);
    const ids = []; for (let i = 0; i < 10; i++) ids.push(m.launch());
    m.gatePassed(ids[0]); m.ballEntered(ids[1], 'out'); m.ballEntered(ids[2], 'general'); m.advance(60000);
    return { pass: lot === 0, detail: `lottery=${lot}` };
  } },
  { id: 'R03', title: '保留満杯時は抽選せず（保留に入らず）、賞球は入賞として付与される', run() {
    const cfg = NEVER(clone(sampleSt)); const { m, rng } = mk(cfg);
    let rej = 0; m.on('holdRejected', () => rej++);
    const owned0 = m.balls.owned;
    for (let i = 0; i < 4 + 1; i++) enter(m, 'start1'); // 1個が変動中、4個が保留
    const callsFull = rng.calls;
    enter(m, 'start1');
    const pass = rej === 1 && rng.calls === callsFull && m.holds[1].length === 4;
    return { pass, detail: `保留=${m.holds[1].length}/4, 満杯拒否=${rej}, 満杯時の乱数使用=${rng.calls - callsFull}, 持ち玉増減=${m.balls.owned - owned0}(発射6,賞球3x6=18)` };
  } },
  { id: 'R04', title: '特図1/2は別系統の保留。優先順位(sp2First/sp1First/fifo)が設定どおり', run() {
    const res = [];
    for (const [pr, expect] of [['sp2First', 2], ['sp1First', 1], ['fifo', 1]]) {
      const cfg = NEVER(clone(sampleSt)); cfg.holds.priority = pr; const { m } = mk(cfg);
      openDenchu(m);
      enter(m, 'start1');                // 変動開始
      enter(m, 'start1'); enter(m, 'start2');  // sp1(先) と sp2(後) が保留
      let first = null; m.on('spinStart', (e) => { if (first == null) first = e.sp; });
      m.advance(cfg.spinMs[1].normal);   // 最初の変動終了→次の変動開始
      res.push(`${pr}: 次の変動=特図${first}(期待${expect})`);
      if (first !== expect) return { pass: false, detail: res.join(' / ') };
    }
    const cfg = NEVER(clone(sampleSt)); const { m } = mk(cfg); openDenchu(m);
    for (let i = 0; i < 3; i++) enter(m, 'start2');
    res.push(`別系統: sp2のみ3入賞時 sp1保留=${m.holds[1].length}, sp2保留=${m.holds[2].length}`);
    return { pass: m.holds[1].length === 0, detail: res.join(' / ') };
  } },
  { id: 'R05', title: '電チュー閉鎖中の特図2始動口は無効（抽選・保留なし）', run() {
    const cfg = ALWAYS(clone(sampleSt)); const { m, rng } = mk(cfg);
    const r = enter(m, 'start2');
    return { pass: r.r.accepted === false && rng.calls === 0 && m.holds[2].length === 0, detail: `accepted=${r.r.accepted}, 乱数使用=${rng.calls}` };
  } },
  { id: 'R06', title: 'V入賞した時だけST、V入賞なしは時短（V入賞口はV開放ラウンドでのみ有効）', run() {
    const cfg = sampleSt; const T = cfg.hitTypes.R10V; const out = [];
    const runCase = (label, vRounds) => {
      const { m } = intoRound1(cfg);
      for (let r = 1; r <= T.rounds; r++) {
        if (vRounds.includes(r)) enter(m, 'v');
        enter(m, 'attacker');
        m.advance(T.openMs); m.advance(T.closeDelayMs + (r < T.rounds ? T.intervalMs : T.endingMs));
      }
      out.push(`${label}: mode=${m.mode}`);
      return m.mode;
    };
    const a = runCase('Vなし', []);
    const b = runCase('V開放外ラウンド(3R)のVのみ', [3]);
    const c = runCase('10RでV入賞', [10]);
    return { pass: a === 'jitan' && b === 'jitan' && c === 'st', detail: out.join(' / ') };
  } },
  { id: 'R07', title: 'ST・時短回数が特図の抽選（変動）回数ごとに減り、0で通常へ戻る', run() {
    const cfg = NEVER(clone(sampleSt)); cfg.holds.max = { 1: 4, 2: 4 };
    const { m } = mk(cfg); m.stLeft = 3; m.mode = 'st';
    const seq = []; m.on('spinStart', (e) => seq.push(e.stLeft));
    for (let i = 0; i < 3; i++) { enter(m, 'start1'); m.advance(cfg.spinMs[1].support); }
    const stOk = seq.join(',') === '2,1,0' && m.mode === 'normal';
    const { m: j } = mk(cfg); j.jitanLeft = 2; j.mode = 'jitan';
    const seq2 = []; j.on('spinStart', (e) => seq2.push(e.jitanLeft));
    for (let i = 0; i < 2; i++) { enter(j, 'start1'); j.advance(cfg.spinMs[1].support); }
    return { pass: stOk && seq2.join(',') === '1,0' && j.mode === 'normal', detail: `ST残: ${seq.join(',')} → ${m.mode} / 時短残: ${seq2.join(',')} → ${j.mode}` };
  } },
  { id: 'R08', title: 'ST中の大当たり後にST回数が再設定される（V入賞時）', run() {
    const cfg = only(ALWAYS(clone(sampleSt)), 'R10V'); cfg.lottery.low = { 1: 0, 2: 0 };
    const { m } = mk(cfg); m.mode = 'st'; m.stLeft = 5;
    enter(m, 'start1'); m.advance(cfg.spinMs[1].support); // 当たり（高確率）
    m.advance(cfg.hitTypes.R10V.openingMs);
    const T = cfg.hitTypes.R10V;
    for (let r = 1; r <= T.rounds; r++) { if (r === T.vRound) enter(m, 'v'); m.advance(T.openMs + T.closeDelayMs + (r < T.rounds ? T.intervalMs : T.endingMs)); }
    return { pass: m.mode === 'st' && m.stLeft === T.afterV.spins, detail: `mode=${m.mode}, ST残=${m.stLeft}(再設定値${T.afterV.spins})` };
  } },
  { id: 'R09', title: 'ST終了時の残保留: consume=消化後に通常へ / discard=破棄して通常へ', run() {
    const out = []; let ok = true;
    for (const pol of ['consume', 'discard']) {
      const cfg = NEVER(clone(sampleSt)); cfg.holds.atStEnd = pol; const { m } = mk(cfg);
      m.mode = 'st'; m.stLeft = 1;
      enter(m, 'start1'); enter(m, 'start1'); enter(m, 'start1'); // 変動1 + 保留2
      m.advance(cfg.spinMs[1].support);
      const mid = `${m.mode}(保留${m.holds[1].length})`;
      m.advance(cfg.spinMs[1].support * 3);
      out.push(`${pol}: ST残0直後=${mid} → 最終=${m.mode}`);
      if (pol === 'consume') ok = ok && mid.startsWith('st') && m.mode === 'normal';
      else ok = ok && mid.startsWith('normal') && m.mode === 'normal';
    }
    return { pass: ok, detail: out.join(' / ') };
  } },
  { id: 'R10', title: 'アタッカーは規定入賞数 または 規定時間で閉鎖処理に入る', run() {
    const cfg = sampleSt, T = cfg.hitTypes.R10V;
    const a = intoRound1(cfg).m; const reasons = []; a.on('closing', (e) => reasons.push(e.reason));
    for (let i = 0; i < T.countMax; i++) enter(a, 'attacker');
    const b = intoRound1(cfg).m; b.on('closing', (e) => reasons.push(e.reason));
    b.advance(T.openMs);
    return { pass: reasons[0] === 'count' && reasons[1] === 'time', detail: `規定数到達→${reasons[0]}, 無入賞→${reasons[1]}` };
  } },
  { id: 'R11', title: '閉鎖遅延中に入った玉はオーバー入賞として計数・賞球され、遅延後は無効', run() {
    const cfg = sampleSt, T = cfg.hitTypes.R10V; const { m } = intoRound1(cfg);
    let over = 0, ended = null; m.on('attackerHit', (e) => { if (e.over) over++; }); m.on('roundEnd', (e) => { if (!ended) ended = e; });
    for (let i = 0; i < T.countMax; i++) enter(m, 'attacker');
    const before = m.balls.owned;
    m.advance(100); enter(m, 'attacker'); m.advance(100); enter(m, 'attacker'); // 遅延(500ms)内
    const gained = m.balls.owned - before + 2; // 発射2球分を戻す
    m.advance(T.closeDelayMs);              // 遅延完了
    const late = enter(m, 'attacker');
    return { pass: over === 2 && gained === 2 * cfg.payouts.attacker && ended.over === 2 && ended.count === T.countMax + 2 && late.r.accepted === false,
      detail: `オーバー入賞=${over}, 追加賞球=${gained}, ラウンド計数=${ended.count}(規定${T.countMax}+2), 遅延後の入賞=${late.r.accepted ? '有効(NG)' : '無効'}` };
  } },
  { id: 'R12', title: '1玉につき入賞処理は1回だけ（重複確定・未発射IDは無効）', run() {
    const cfg = NEVER(clone(sampleSt)); const { m } = mk(cfg);
    const id = m.launch(); const owned = m.balls.owned;
    const r1 = m.ballEntered(id, 'general'); const r2 = m.ballEntered(id, 'general'); const r3 = m.ballEntered(id, 'start1'); const r4 = m.ballEntered(9999, 'general');
    return { pass: r1.accepted && !r2.accepted && !r3.accepted && !r4.accepted && m.balls.owned === owned + cfg.payouts.general,
      detail: `1回目=${r1.accepted}, 重複=${r2.accepted}/${r3.accepted}, 未発射ID=${r4.accepted}, 賞球=${m.balls.owned - owned}` };
  } },
  { id: 'R13', title: '持ち玉は発射ごとに減り、賞球は入賞ごとに即時加算（演出終了時の一括加算ではない）', run() {
    const cfg = sampleSt, T = cfg.hitTypes.R10V; const { m } = intoRound1(cfg);
    const trail = [];
    for (let i = 0; i < 3; i++) {
      const o0 = m.balls.owned; const id = m.launch(); const o1 = m.balls.owned;
      m.ballEntered(id, 'attacker'); const o2 = m.balls.owned;
      trail.push([o0 - o1, o2 - o1]);
    }
    return { pass: trail.every(([dec, inc]) => dec === 1 && inc === cfg.payouts.attacker), detail: `発射-1/入賞直後+${cfg.payouts.attacker}: ${JSON.stringify(trail)}（大当たり継続中=${m.jp ? 'はい' : 'いいえ'}, ${T.rounds}R）` };
  } },
  { id: 'R14', title: '玉切れ(持ち玉0)では発射できない', run() {
    const cfg = clone(sampleSt); cfg.balls.initial = 2; const { m } = mk(cfg);
    const a = m.launch(), b = m.launch(), c = m.launch();
    return { pass: a && b && c === null && m.balls.owned === 0, detail: `3球目=${c}` };
  } },
  { id: 'R15', title: '設定不整合（分母0・振分合計不一致・未確定値）を遊技開始前に検出', run() {
    const bad1 = clone(sampleSt); bad1.lottery.den = 0;
    const bad2 = clone(sampleSt); bad2.distribution[1] = [{ type: 'R10V', weight: 50 }, { type: 'R4', weight: 40 }];
    const bad3 = clone(sampleSt); bad3.lottery.low[1] = 12.5;
    const bad4 = clone(sampleSt); bad4.lottery.low[1] = bad4.lottery.den + 1;
    const n = [bad1, bad2, bad3, bad4].map((c) => validateConfig(c).filter((i) => i.level === 'error').length);
    const ev = validateConfig(eva15);
    const unc = ev.filter((i) => i.level === 'unconfirmed').length;
    let blocked = false; try { new PachinkoMachine(eva15, createSeededRng(1)); } catch { blocked = true; }
    return { pass: n.every((x) => x > 0) && validateConfig(sampleSt).length === 0 && unc > 0 && blocked, detail: `不正設定のエラー数=${n.join(',')}, サンプル台の指摘=0, エヴァ15プリセットの未確定項目=${unc}件で遊技開始を拒否=${blocked}` };
  } },
  { id: 'R16', title: '物理: 規定入賞数到達時に盤面上の玉を消さない（閉鎖遅延中に実際に到達した玉をオーバー入賞で計数）', run() {
    const cfg = clone(sampleSt); cfg.hitTypes.R10V.countMax = 1; cfg.hitTypes.R10V.closeDelayMs = 800; cfg.lottery.low = { 1: cfg.lottery.den, 2: cfg.lottery.den };
    only(cfg, 'R10V');
    const s = new GameSession(cfg, { machineRng: deriveSeededRng(3, 'm'), physicsRng: deriveSeededRng(3, 'p') });
    const m = s.machine; enter(m, 'start1'); s.update(cfg.spinMs[1].normal); s.update(cfg.hitTypes.R10V.openingMs + 10);
    const a = s.layout.params.ports.attacker;
    // アタッカー直上に高さ違いで玉を配置し、実際の落下で到達させる
    const ids = [];
    for (let i = 0; i < 4; i++) { const id = m.launch(); ids.push(id); s.world.balls.push({ id, x: a.x - 20 + i * 4, y: a.y - 14 - i * 30, vx: 0, vy: 150, age: 1, still: 0, gates: new Set(), strength: 0 }); }
    let over = 0; m.on('attackerHit', (e) => { if (e.over) over++; });
    let closingAt = null, ballsAtClose = null, removedByLogic = false;
    m.on('closing', () => { closingAt = s.simMs; ballsAtClose = s.world.balls.length; });
    for (let t = 0; t < 120; t++) { const before = s.world.balls.length; s.update(10); if (closingAt === s.simMs - 10 && s.world.balls.length < before - 4) removedByLogic = true; }
    return { pass: over >= 1 && ballsAtClose !== null && !removedByLogic, detail: `閉鎖遅延中の物理到達によるオーバー入賞=${over}件（盤面の玉は規定数到達で強制消去されない）` };
  } },
];

export function runRules() {
  return RULES.map((r) => {
    try { const o = r.run(); return { id: r.id, title: r.title, pass: !!o.pass, detail: o.detail }; }
    catch (e) { return { id: r.id, title: r.title, pass: false, detail: `例外: ${e.stack || e}` }; }
  });
}
