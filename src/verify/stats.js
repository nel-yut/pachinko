// 検証用の集計。machine のイベントだけを購読し、遊技ロジックには手を入れない。
export class StatsCollector {
  constructor(machine) {
    this.m = machine;
    const mk = () => ({ entries: 0, rejectedFull: 0, hits: 0, byMode: { low: { draws: 0, hits: 0 }, high: { draws: 0, hits: 0 } }, spins: 0, byType: {} });
    this.sp = { 1: mk(), 2: mk() };
    this.launched = 0; this.returned = 0; this.out = 0; this.duplicate = 0; this.invalid = 0;
    this.ports = { start1: 0, start2: 0, general: 0, attacker: 0, v: 0 };
    this.payoutTotal = 0; this.payoutByPort = {};
    this.jackpots = 0; this.origin = { first: 0, jitanReturn: 0, holdReturn: 0, stContinue: 0 };
    this.firstDirectSt = 0;          // 初当たり直行ST（初当たりの jackpotEnd で next=st）
    this.stStarts = 0; this.stReset = 0; this.stHitNoReset = 0; this.stExpired = 0;
    this.chains = 0; this.chainsWithSt = 0; this.chainHits = []; this.chainPayout = [];
    this._chain = null;
    this.jackpotPayouts = [];        // 1大当たりごとの獲得賞球(アタッカー分)
    this.rounds = {};                // round番号 -> {n,count,payout,over}
    this.overCount = 0; this.overPayout = 0;
    this.vRounds = 0; this.vSuccess = 0;
    this.attackerClosedByCount = 0; this.attackerClosedByTime = 0;
    this.holdDiscarded = 0;
    const pay = machine.cfg.payouts.attacker;
    const on = (n, f) => machine.on(n, f);
    on('launched', () => this.launched++);
    on('returned', () => { this.returned++; this.launched--; });
    on('out', () => this.out++);
    on('duplicateRejected', () => this.duplicate++);
    on('invalidEntry', () => this.invalid++);
    on('settled', (e) => { if (this.ports[e.port] !== undefined) this.ports[e.port]++; });
    on('payout', (e) => { this.payoutTotal += e.amount; this.payoutByPort[e.port] = (this.payoutByPort[e.port] || 0) + e.amount; });
    on('holdRejected', (e) => { this.sp[e.sp].entries++; this.sp[e.sp].rejectedFull++; });
    on('lottery', (e) => {
      const s = this.sp[e.sp]; s.entries++;
      const b = s.byMode[e.probMode]; b.draws++; if (e.hit) { b.hits++; s.byType[e.type] = (s.byType[e.type] || 0) + 1; }
    });
    on('spinStart', (e) => { this.sp[e.sp].spins++; });
    on('spinEnd', (e) => { if (e.hit) this.sp[e.sp].hits++; });
    on('holdsDiscarded', (e) => { this.holdDiscarded += e.count; });
    on('jackpotStart', (e) => {
      this.jackpots++; this.origin[e.origin]++;
      if (e.origin === 'first') { this.chains++; this._chain = { hits: 0, payout: 0, st: false }; }
      if (this._chain) this._chain.hits++;
    });
    on('roundStart', (e) => { if (e.vRound) this.vRounds++; });
    on('closing', (e) => { if (e.reason === 'count') this.attackerClosedByCount++; else this.attackerClosedByTime++; });
    on('roundEnd', (e) => {
      const r = (this.rounds[e.round] ||= { n: 0, count: 0, payout: 0, over: 0 });
      r.n++; r.count += e.count; r.payout += e.payout; r.over += e.over;
      this.overCount += e.over; this.overPayout += e.over * pay;
    });
    on('vAchieved', () => { this.vSuccess++; });
    on('jackpotEnd', (e) => {
      this.jackpotPayouts.push(e.total.payout);
      if (this._chain) this._chain.payout += e.total.payout;
      if (e.next.mode === 'st') {
        this.stStarts++;
        if (e.origin === 'first') this.firstDirectSt++;
        if (e.origin === 'stContinue') this.stReset++;
        if (this._chain) this._chain.st = true;
      } else if (e.origin === 'stContinue') this.stHitNoReset++;
      if (e.next.mode === 'normal' && this._chain) this._closeChain();
    });
    on('modeChange', (e) => {
      if (e.reason === 'st-expired') this.stExpired++;
      if (e.to === 'normal' && this._chain && e.reason !== 'jackpot-end') this._closeChain();
    });
  }
  _closeChain() {
    const c = this._chain; this._chain = null;
    if (c.st) this.chainsWithSt++;
    this.chainHits.push(c.hits); this.chainPayout.push(c.payout);
  }
  finish() { if (this._chain) this._closeChain(); }
}
