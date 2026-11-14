// 機種設定の検証。遊技開始前に不整合・未確定値を検出する。
//   level 'error'       : 値が不正（分母0、振分合計が合わない、定義漏れ等）
//   level 'unconfirmed' : 値が null（参照元で未確認）。数値を推測で補わず、遊技開始を止める。

export const MODES = ['normal', 'jitan', 'st'];
const PORTS_PAID = ['start1', 'start2', 'general', 'attacker'];

export function validateConfig(cfg) {
  const issues = [];
  const err = (path, message) => issues.push({ level: 'error', path, message });
  const unc = (path, message = '未確定（参照元で未確認）') => issues.push({ level: 'unconfirmed', path, message });

  const int = (path, v, min = 0, max = Infinity) => {
    if (v === null || v === undefined) { unc(path); return false; }
    if (!Number.isInteger(v) || v < min || v > max) { err(path, `整数 ${min}以上${max === Infinity ? '' : max + '以下'} が必要: ${v}`); return false; }
    return true;
  };
  const nextState = (path, s, allowNull) => {
    if (s === null || s === undefined) { if (!allowNull) unc(path); return; }
    if (!MODES.includes(s.mode)) { err(`${path}.mode`, `mode は ${MODES.join('/')} のいずれか`); return; }
    if (s.mode === 'normal') return;
    int(`${path}.spins`, s.spins, 1);
  };

  if (!cfg || typeof cfg !== 'object') return [{ level: 'error', path: '', message: '設定がオブジェクトではありません' }];

  // --- 抽選 ---
  const L = cfg.lottery || {};
  const den = L.den;
  const denOk = int('lottery.den', den, 1);
  for (const lvl of ['low', 'high']) {
    for (const sp of ['1', '2']) {
      const ok = int(`lottery.${lvl}.${sp}`, L[lvl]?.[sp], 0, denOk ? den : Infinity);
      void ok;
    }
  }
  if (!['low', 'high'].includes(L.probDuringJackpot)) {
    if (L.probDuringJackpot == null) unc('lottery.probDuringJackpot', '大当たり中の入賞の抽選確率区分が未確定'); else err('lottery.probDuringJackpot', "'low' か 'high'");
  }

  // --- 保留 ---
  const H = cfg.holds || {};
  int('holds.max.1', H.max?.[1], 1); int('holds.max.2', H.max?.[2], 1);
  if (!['sp2First', 'sp1First', 'fifo'].includes(H.priority)) H.priority == null ? unc('holds.priority') : err('holds.priority', 'sp2First/sp1First/fifo');
  if (!['consume', 'discard'].includes(H.atStEnd)) H.atStEnd == null ? unc('holds.atStEnd', 'ST終了時の残保留の扱いが未確定') : err('holds.atStEnd', 'consume/discard');

  // --- 変動時間 ---
  for (const sp of ['1', '2']) for (const k of ['normal', 'support']) int(`spinMs.${sp}.${k}`, cfg.spinMs?.[sp]?.[k], 1);

  // --- 賞球 ---
  for (const p of PORTS_PAID) int(`payouts.${p}`, cfg.payouts?.[p], 0);

  // --- 持ち玉 ---
  int('balls.initial', cfg.balls?.initial, 0);

  // --- 当たり種別と振分 ---
  const types = cfg.hitTypes || {};
  const typeIds = Object.keys(types);
  if (typeIds.length === 0) unc('hitTypes', '当たり種別が未定義');
  for (const id of typeIds) {
    const t = types[id]; const p = `hitTypes.${id}`;
    int(`${p}.rounds`, t.rounds, 1); int(`${p}.countMax`, t.countMax, 1); int(`${p}.openMs`, t.openMs, 1);
    int(`${p}.closeDelayMs`, t.closeDelayMs, 0); int(`${p}.intervalMs`, t.intervalMs, 0);
    int(`${p}.openingMs`, t.openingMs, 0); int(`${p}.endingMs`, t.endingMs, 0);
    if (t.vRound !== null && t.vRound !== undefined) int(`${p}.vRound`, t.vRound, 1, Number.isInteger(t.rounds) ? t.rounds : Infinity);
    nextState(`${p}.afterV`, t.afterV, false);
    nextState(`${p}.afterNoV`, t.afterNoV, true);
    if ((t.vRound == null) && t.afterNoV) err(`${p}.afterNoV`, 'V入賞条件(vRound)が無い種別に afterNoV は指定できません');
  }
  const D = cfg.distribution || {};
  for (const sp of ['1', '2']) {
    const list = D[sp];
    if (!Array.isArray(list) || list.length === 0) { unc(`distribution.${sp}`, '当たり振分が未定義'); continue; }
    if (!int('distribution.total', D.total, 1)) continue;
    let sum = 0, okAll = true;
    list.forEach((e, i) => {
      if (!types[e.type]) { err(`distribution.${sp}[${i}].type`, `未定義の当たり種別: ${e.type}`); okAll = false; }
      if (!int(`distribution.${sp}[${i}].weight`, e.weight, 0)) okAll = false; else sum += e.weight;
    });
    if (okAll && sum !== D.total) err(`distribution.${sp}`, `振分合計が ${D.total} になりません（現在 ${sum}）`);
  }

  // --- 電チュー(普図) ---
  const C = cfg.denchu || {};
  int('denchu.gateSpinMs', C.gateSpinMs, 1); int('denchu.gateHoldMax', C.gateHoldMax, 1);
  const gd = int('denchu.gateLottery.den', C.gateLottery?.den, 1);
  for (const k of ['normal', 'support']) {
    int(`denchu.gateLottery.${k}`, C.gateLottery?.[k], 0, gd ? C.gateLottery.den : Infinity);
    int(`denchu.openMs.${k}`, C.openMs?.[k], 1); int(`denchu.maxBalls.${k}`, C.maxBalls?.[k], 1);
  }

  // --- 盤面 ---
  if (!cfg.board || !cfg.board.layout) err('board.layout', '盤面レイアウトの指定が必要');

  return issues;
}

export function hasBlocking(issues) { return issues.length > 0; }

export class MachineConfigError extends Error {
  constructor(issues) {
    super(`機種設定に問題があります (${issues.length}件)`);
    this.issues = issues;
  }
}
