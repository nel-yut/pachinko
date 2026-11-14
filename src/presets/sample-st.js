// 汎用ST機サンプル。遊技・検証・UI確認用の「架空の」台設定で、特定実機の数値ではない。
// すべて設定値として変更可能（UIのJSON編集、または別プリセットの追加）。
// 205/65536 は設計書の独自設定例。ST/時短回数やラウンド構成はサンプルであり、エヴァ15の値ではない。

export const sampleSt = {
  id: 'sample-st',
  name: '汎用ST機サンプル（架空の台設定）',
  status: 'sample',
  notes: ['数値はすべてサンプル。エヴァ15等の実機数値ではない。'],
  display: { lowText: '205/65536 (約1/319.7)', highText: '2050/65536 (約1/32.0)' },
  balls: { initial: 2000 },
  lottery: {
    den: 65536,
    low: { 1: 205, 2: 205 },
    high: { 1: 2050, 2: 2050 },
    probDuringJackpot: 'low',
  },
  holds: { max: { 1: 4, 2: 4 }, priority: 'sp2First', atStEnd: 'consume' },
  spinMs: { 1: { normal: 6000, support: 2500 }, 2: { normal: 2500, support: 2500 } },
  payouts: { start1: 3, start2: 1, general: 10, attacker: 15 },
  distribution: {
    total: 100,
    1: [{ type: 'R10V', weight: 60 }, { type: 'R4', weight: 40 }],
    2: [{ type: 'R10V', weight: 80 }, { type: 'R4', weight: 20 }],
  },
  hitTypes: {
    R10V: {
      label: '10R V-ST', rounds: 10, countMax: 9, openMs: 15000, closeDelayMs: 500,
      intervalMs: 1500, openingMs: 3000, endingMs: 3000, vRound: 10,
      afterV: { mode: 'st', spins: 100 }, afterNoV: { mode: 'jitan', spins: 50 },
    },
    R4: {
      label: '4R 通常(時短)', rounds: 4, countMax: 9, openMs: 15000, closeDelayMs: 500,
      intervalMs: 1500, openingMs: 3000, endingMs: 3000, vRound: null,
      afterV: { mode: 'jitan', spins: 50 }, afterNoV: null,
    },
  },
  denchu: {
    gateSpinMs: 1500, gateHoldMax: 4,
    gateLottery: { den: 256, normal: 25, support: 250 },
    openMs: { normal: 1200, support: 4000 }, maxBalls: { normal: 2, support: 5 },
  },
  board: { layout: 'generic-st' },
};
