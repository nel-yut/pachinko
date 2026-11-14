// 遊技ロジック本体（物理・描画・演出に依存しない）。
//   入力 : launch() / ballEntered(ballId, port) / gatePassed(ballId) / advance(ms)
//   出力 : イベント(on) と snapshot()
// 時間は仮想時計(now, ms)。通常遊技(実時間)も大量試行(高速)も同じ advance() を通る。
// 抽選は「有効な始動口入賞」の瞬間にだけ行う。発射・演出・変動開始では抽選しない。

import { Emitter } from './events.js';
import { drawProbability, pickWeighted } from './lottery.js';
import { validateConfig, MachineConfigError } from './config-validate.js';

export const PORTS = ['start1', 'start2', 'general', 'attacker', 'v', 'out'];

export class PachinkoMachine extends Emitter {
  constructor(config, rng, { allowIssues = false } = {}) {
    super();
    const issues = validateConfig(config);
    if (issues.length && !allowIssues) throw new MachineConfigError(issues);
    this.cfg = config;
    this.rng = rng;
    this.now = 0;
    this._q = []; this._qid = 0;
    this._seq = 0; this._ballSeq = 0; this._chainSeq = 0;
    this.inFlight = new Set();       // 発射済みで未確定の玉ID（二重確定防止）
    this.gatePassedBy = new Set();   // 玉ごとのゲート通過済み（同一玉の二重通過防止）
    this.balls = { owned: config.balls.initial, launched: 0, returned: 0, payoutTotal: 0 };
    this.mode = 'normal';            // normal | jitan | st | jackpot
    this.stLeft = 0; this.jitanLeft = 0;
    this.holds = { 1: [], 2: [] };
    this.spin = null;                // {sp, hold}
    this.jp = null;                  // 大当たり進行
    this.chainId = 0;
    this.gate = { holds: 0, spinning: false, denchuOpen: false, denchuCount: 0, denchuTimer: null };
  }

  // ---------- 時間 ----------
  schedule(delay, fn) {
    const id = ++this._qid;
    this._q.push({ at: this.now + delay, id, fn });
    return id;
  }
  cancel(id) { this._q = this._q.filter((e) => e.id !== id); }
  advance(ms) {
    const target = this.now + ms;
    for (;;) {
      let bi = -1;
      for (let i = 0; i < this._q.length; i++) {
        const e = this._q[i];
        if (e.at <= target && (bi < 0 || e.at < this._q[bi].at || (e.at === this._q[bi].at && e.id < this._q[bi].id))) bi = i;
      }
      if (bi < 0) break;
      const [e] = this._q.splice(bi, 1);
      this.now = e.at; e.fn();
    }
    this.now = target;
  }

  // ---------- 玉の出入り ----------
  /** 発射。持ち玉を1つ減らし玉IDを返す。持ち玉0なら null。 */
  launch() {
    if (this.balls.owned <= 0) return null;
    this.balls.owned--; this.balls.launched++;
    const id = ++this._ballSeq;
    this.inFlight.add(id);
    this.emit('launched', { ballId: id });
    return id;
  }
  /** 発射レールから戻った玉（持ち玉へ返却）。 */
  ballReturned(ballId) {
    if (!this.inFlight.delete(ballId)) return this._dup(ballId, 'return');
    this.balls.owned++; this.balls.returned++; this.balls.launched--;
    this.gatePassedBy.delete(ballId);
    this.emit('returned', { ballId });
    return { accepted: true };
  }
  _dup(ballId, port) {
    this.emit('duplicateRejected', { ballId, port });
    return { accepted: false, reason: 'duplicate' };
  }
  _pay(n, port, ballId) {
    if (n > 0) { this.balls.owned += n; this.balls.payoutTotal += n; }
    this.emit('payout', { ballId, port, amount: n });
  }

  /** 玉の終端イベント。1玉につき最初の1回だけ処理する。 */
  ballEntered(ballId, port) {
    if (!this.inFlight.has(ballId)) return this._dup(ballId, port);
    this.inFlight.delete(ballId); this.gatePassedBy.delete(ballId);
    const pay = this.cfg.payouts;
    let result = { accepted: true };
    switch (port) {
      case 'out': this.emit('out', { ballId }); break;
      case 'general': this._pay(pay.general, port, ballId); this.emit('settled', { ballId, port }); break;
      case 'start1': this._startEntry(1, ballId); break;
      case 'start2':
        if (!this.gate.denchuOpen) { this.emit('invalidEntry', { ballId, port, reason: 'denchu-closed' }); result = { accepted: false, reason: 'closed' }; }
        else this._startEntry(2, ballId);
        break;
      case 'attacker': case 'v': result = this._attackerEntry(ballId, port === 'v'); break;
      default: throw new Error(`unknown port ${port}`);
    }
    return result;
  }

  // ---------- 始動口 → 抽選 → 保留 ----------
  _probMode() {
    if (this.mode === 'st') return 'high';
    if (this.mode === 'jackpot') return this.cfg.lottery.probDuringJackpot;
    return 'low';
  }
  _startEntry(sp, ballId) {
    this._pay(this.cfg.payouts[sp === 1 ? 'start1' : 'start2'], `start${sp}`, ballId);
    if (sp === 2) {
      this.gate.denchuCount++;
      if (this.gate.denchuCount >= this.cfg.denchu.maxBalls[this._support() ? 'support' : 'normal']) this._closeDenchu();
    }
    if (this.holds[sp].length >= this.cfg.holds.max[sp]) {
      this.emit('holdRejected', { ballId, sp, holds: this.holds[sp].length });
      this.emit('settled', { ballId, port: `start${sp}` });
      return;
    }
    // 抽選（入賞時に1回だけ）
    const L = this.cfg.lottery;
    const probMode = this._probMode();
    const hit = drawProbability(this.rng, L[probMode][sp], L.den);
    const type = hit ? pickWeighted(this.rng, this.cfg.distribution[sp], this.cfg.distribution.total).type : null;
    const hold = { seq: ++this._seq, sp, hit, type, drawnMode: this.mode, probMode };
    this.holds[sp].push(hold);
    this.emit('settled', { ballId, port: `start${sp}` });
    this.emit('lottery', { ballId, sp, hit, type, probMode, num: L[probMode][sp], den: L.den, drawnMode: this.mode });
    this.emit('holdAdded', { sp, hold, holds: this.holdCounts() });
    this._tryStartSpin();
  }
  holdCounts() { return { 1: this.holds[1].length, 2: this.holds[2].length }; }
  _support() { return this.mode === 'jitan' || this.mode === 'st'; }

  _pickHold() {
    const h1 = this.holds[1], h2 = this.holds[2];
    if (!h1.length && !h2.length) return null;
    let sp;
    if (!h1.length) sp = 2; else if (!h2.length) sp = 1;
    else {
      const pr = this.cfg.holds.priority;
      sp = pr === 'sp2First' ? 2 : pr === 'sp1First' ? 1 : (h1[0].seq < h2[0].seq ? 1 : 2);
    }
    return this.holds[sp].shift();
  }

  // ---------- 変動 ----------
  _tryStartSpin() {
    if (this.spin || this.jp) return;
    const hold = this._pickHold();
    if (!hold) { this._settleModeIfIdle(); return; }
    const modeAtStart = this.mode;
    if (this.mode === 'st' && this.stLeft > 0) this.stLeft--;     // ST・時短は特図の消化回数で減る
    if (this.mode === 'jitan' && this.jitanLeft > 0) this.jitanLeft--;
    this.spin = { sp: hold.sp, hold, modeAtStart };
    const dur = this.cfg.spinMs[hold.sp][modeAtStart === 'normal' ? 'normal' : 'support'];
    this.emit('spinStart', { sp: hold.sp, hit: hold.hit, type: hold.type, duration: dur, mode: modeAtStart, stLeft: this.stLeft, jitanLeft: this.jitanLeft, holds: this.holdCounts() });
    this.schedule(dur, () => this._spinEnd());
  }
  _spinEnd() {
    const { sp, hold, modeAtStart } = this.spin; this.spin = null;
    this.emit('spinEnd', { sp, hit: hold.hit, type: hold.type, mode: modeAtStart, stLeft: this.stLeft, jitanLeft: this.jitanLeft });
    if (hold.hit) { this._startJackpot(hold, modeAtStart); return; }
    if (this.mode === 'jitan' && this.jitanLeft === 0) this._changeMode('normal', 'jitan-expired');
    // ST回数を消化した時点で、残保留の扱い(設定)を適用する
    if (this.mode === 'st' && this.stLeft === 0 && this.cfg.holds.atStEnd === 'discard') this._discardHolds();
    this._tryStartSpin();
    this._settleModeIfIdle();
  }
  /** ST回数消化後、残保留の処理が済んだら通常へ戻す。 */
  _settleModeIfIdle() {
    if (this.mode === 'st' && this.stLeft === 0 && !this.spin && !this.jp) {
      if (this.cfg.holds.atStEnd === 'discard') this._discardHolds();
      if (!this.holds[1].length && !this.holds[2].length) this._changeMode('normal', 'st-expired');
    }
  }
  _discardHolds() {
    const d = this.holds[1].length + this.holds[2].length;
    if (d) { this.holds[1] = []; this.holds[2] = []; this.emit('holdsDiscarded', { count: d }); }
  }
  _changeMode(mode, reason) {
    const from = this.mode; this.mode = mode;
    if (mode === 'normal') { this.stLeft = 0; this.jitanLeft = 0; }
    this.emit('modeChange', { from, to: mode, reason, stLeft: this.stLeft, jitanLeft: this.jitanLeft });
  }

  // ---------- 大当たり ----------
  _startJackpot(hold, modeAtConsume) {
    const t = this.cfg.hitTypes[hold.type];
    let origin;
    if (modeAtConsume === 'normal') origin = hold.drawnMode === 'normal' ? 'first' : 'holdReturn';
    else if (modeAtConsume === 'jitan') origin = 'jitanReturn';
    else origin = 'stContinue';
    if (origin === 'first') this.chainId = ++this._chainSeq;
    this.jp = {
      sp: hold.sp, typeId: hold.type, t, origin, chainId: this.chainId, modeBefore: modeAtConsume,
      round: 0, step: 'opening', count: 0, over: 0, payout: 0, vAchieved: false, vOpen: false,
      accepting: false, total: { count: 0, over: 0, payout: 0 }, timer: null,
    };
    this.stLeft = 0; this.jitanLeft = 0;
    this._closeDenchu();
    this._changeMode('jackpot', 'hit');
    this.emit('jackpotStart', { sp: hold.sp, type: hold.type, label: t.label, origin, chainId: this.chainId, rounds: t.rounds, modeBefore: modeAtConsume });
    this.schedule(t.openingMs, () => this._startRound(1));
  }
  _startRound(r) {
    const jp = this.jp, t = jp.t;
    jp.round = r; jp.step = 'open'; jp.count = 0; jp.over = 0; jp.payout = 0;
    jp.accepting = true; jp.vOpen = t.vRound === r;
    this.emit('roundStart', { round: r, rounds: t.rounds, countMax: t.countMax, vRound: jp.vOpen });
    jp.timer = this.schedule(t.openMs, () => this._beginClose('time'));
  }
  _attackerEntry(ballId, isV) {
    const jp = this.jp;
    if (!jp || !jp.accepting) { this.emit('invalidEntry', { ballId, port: isV ? 'v' : 'attacker', reason: 'attacker-closed' }); return { accepted: false, reason: 'closed' }; }
    const over = jp.step === 'closing';
    jp.count++; jp.total.count++;
    const amount = this.cfg.payouts.attacker;
    jp.payout += amount; jp.total.payout += amount;
    if (over) { jp.over++; jp.total.over++; }
    this._pay(amount, isV ? 'v' : 'attacker', ballId);
    this.emit('settled', { ballId, port: isV ? 'v' : 'attacker' });
    this.emit('attackerHit', { ballId, round: jp.round, count: jp.count, over, amount });
    if (isV && jp.vOpen && !jp.vAchieved) { jp.vAchieved = true; this.emit('vAchieved', { round: jp.round, over }); }
    // 規定数到達 → 閉鎖「処理」を開始するだけ。盤面上の玉は消さない
    if (!over && jp.step === 'open' && jp.count >= jp.t.countMax) this._beginClose('count');
    return { accepted: true, over };
  }
  _beginClose(reason) {
    const jp = this.jp;
    if (!jp || jp.step !== 'open') return;
    if (jp.timer) this.cancel(jp.timer);
    jp.step = 'closing';
    this.emit('closing', { round: jp.round, reason, count: jp.count, delay: jp.t.closeDelayMs });
    jp.timer = this.schedule(jp.t.closeDelayMs, () => this._closeRound(reason));
  }
  _closeRound(reason) {
    const jp = this.jp, t = jp.t;
    jp.accepting = false; jp.vOpen = false;
    this.emit('roundEnd', { round: jp.round, count: jp.count, over: jp.over, payout: jp.payout, reason, vAchieved: jp.vAchieved });
    if (jp.round < t.rounds) {
      jp.step = 'interval';
      jp.timer = this.schedule(t.intervalMs, () => this._startRound(jp.round + 1));
    } else {
      jp.step = 'ending';
      jp.timer = this.schedule(t.endingMs, () => this._endJackpot());
    }
  }
  _endJackpot() {
    const jp = this.jp, t = jp.t;
    const next = (t.vRound != null && !jp.vAchieved) ? (t.afterNoV ?? { mode: 'normal' }) : t.afterV;
    this.jp = null;
    this.emit('jackpotEnd', { sp: jp.sp, type: jp.typeId, origin: jp.origin, chainId: jp.chainId, vAchieved: jp.vAchieved, next, total: jp.total });
    if (next.mode === 'st') { this.stLeft = next.spins; this.jitanLeft = 0; this._changeMode('st', 'jackpot-end'); this.emit('stStart', { spins: next.spins, origin: jp.origin, chainId: jp.chainId }); }
    else if (next.mode === 'jitan') { this.jitanLeft = next.spins; this.stLeft = 0; this._changeMode('jitan', 'jackpot-end'); }
    else this._changeMode('normal', 'jackpot-end');
    this._tryStartSpin();
  }

  // ---------- ゲート → 電チュー ----------
  gatePassed(ballId) {
    if (!this.inFlight.has(ballId) || this.gatePassedBy.has(ballId)) return false;
    this.gatePassedBy.add(ballId);
    this.emit('gatePass', { ballId });
    if (this.gate.holds < this.cfg.denchu.gateHoldMax) this.gate.holds++;
    this._tryGateSpin();
    return true;
  }
  _tryGateSpin() {
    const g = this.gate;
    if (g.spinning || g.denchuOpen || g.holds <= 0) return;
    g.holds--; g.spinning = true;
    const key = this._support() ? 'support' : 'normal';
    const C = this.cfg.denchu;
    const win = drawProbability(this.rng, C.gateLottery[key], C.gateLottery.den);
    this.schedule(C.gateSpinMs, () => {
      g.spinning = false;
      this.emit('gateDraw', { win });
      if (win) this._openDenchu(); else this._tryGateSpin();
    });
  }
  _openDenchu() {
    const g = this.gate, key = this._support() ? 'support' : 'normal';
    g.denchuOpen = true; g.denchuCount = 0;
    this.emit('denchu', { open: true });
    g.denchuTimer = this.schedule(this.cfg.denchu.openMs[key], () => this._closeDenchu());
  }
  _closeDenchu() {
    const g = this.gate;
    if (!g.denchuOpen) return;
    if (g.denchuTimer) this.cancel(g.denchuTimer);
    g.denchuOpen = false; g.denchuTimer = null;
    this.emit('denchu', { open: false });
    this._tryGateSpin();
  }

  // ---------- 参照用 ----------
  /** 物理層が参照する可動部品の状態。 */
  shutters() {
    return { attackerOpen: !!(this.jp && this.jp.accepting), vOpen: !!(this.jp && this.jp.vOpen), denchuOpen: this.gate.denchuOpen };
  }
  /** 推奨打ち方向: 通常時は左打ち、大当たり・時短・ST中は右打ち。 */
  recommendedSide() { return this.mode === 'normal' ? 'left' : 'right'; }
  snapshot() {
    const jp = this.jp;
    return {
      now: this.now, mode: this.mode, stLeft: this.stLeft, jitanLeft: this.jitanLeft,
      holds: this.holdCounts(), spin: this.spin ? { sp: this.spin.sp, hit: this.spin.hold.hit } : null,
      balls: { ...this.balls }, side: this.recommendedSide(),
      jackpot: jp ? { type: jp.typeId, label: jp.t.label, round: jp.round, rounds: jp.t.rounds, count: jp.count, countMax: jp.t.countMax, step: jp.step, vAchieved: jp.vAchieved, vOpen: jp.vOpen, payout: jp.total.payout, over: jp.total.over } : null,
      gate: { holds: this.gate.holds, spinning: this.gate.spinning, denchuOpen: this.gate.denchuOpen },
      shutters: this.shutters(),
    };
  }
}
