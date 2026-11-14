// 参照プリセット: P 新世紀エヴァンゲリオン ～未来への咆哮～（エヴァ15）
// 設計書に明記された公表値だけを確定値として登録する。それ以外は null（未確定）のまま残し、
// 推測で定数を作らない。メーカー公表情報と照合できた項目から順に埋めること。
// 参照元: https://www.sankyo-fever.jp/collection/925/
// ※205/65536 は独自設定の例であり、エヴァ15の内部乱数仕様ではない。ここには使わない。

export const eva15 = {
  id: 'eva15-reference',
  name: 'エヴァ15「未来への咆哮」（参照プリセット・未確定値あり）',
  status: 'reference',
  notes: [
    '設計書記載の公表値のみ登録。null の項目は未確定で、遊技開始前の検証で警告される。',
    '公表確率表示(約1/319.7)とシミュレーター内部の整数比は別物。内部整数比は未確定。',
  ],
  // 設計書に記載のある参照情報（動作には使わない・照合用）
  reference: {
    type: 'V-ST',
    displayLow: '約1/319.7',
    stSpins: 163,
    jitanSpins: 100,
    sp2PayoutNominal: 1500,
    source: 'SANKYO公式 機種詳細（設計書 §3, §13）',
  },
  display: { lowText: '約1/319.7', highText: null },
  balls: { initial: null },
  lottery: {
    den: null,
    low: { 1: null, 2: null },
    high: { 1: null, 2: null },
    probDuringJackpot: null,
  },
  holds: { max: { 1: null, 2: null }, priority: null, atStEnd: null },
  spinMs: { 1: { normal: null, support: null }, 2: { normal: null, support: null } },
  payouts: { start1: null, start2: null, general: null, attacker: null },
  distribution: { total: null, 1: [], 2: [] },
  hitTypes: {},
  denchu: {
    gateSpinMs: null, gateHoldMax: null,
    gateLottery: { den: null, normal: null, support: null },
    openMs: { normal: null, support: null }, maxBalls: { normal: null, support: null },
  },
  board: { layout: 'generic-st' },
};
