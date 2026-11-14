// 理論値の算出（設定値から導出。実測とは独立に計算する）。
// 注意: ここでの理論値は「抽選1回あたり」の厳密値と、保留の先読み効果を無視した近似値を区別して返す。

const g = (a, b) => (b ? g(b, a % b) : a);
export const frac = (num, den) => ({ num, den, value: num / den, text: `${num}/${den}${num ? ` (約1/${(den / num).toFixed(2)})` : ''}` });

export function theory(cfg) {
  const den = cfg.lottery.den, out = { den, sp: {}, notes: [] };
  for (const sp of [1, 2]) {
    const total = cfg.distribution.total;
    const dist = {};
    for (const e of cfg.distribution[sp]) dist[e.type] = (dist[e.type] || 0) + e.weight / total;
    out.sp[sp] = {
      low: frac(cfg.lottery.low[sp], den), high: frac(cfg.lottery.high[sp], den), dist,
    };
  }
  // ST 継続（理想値）: ST中の特図2で N 回の高確率抽選のうち少なくとも1回当たる確率。
  // 実際は ST 突入時点の保留(低確率で抽選済みのもの)が含まれるため、この値は上限寄りの目安。
  const stTypes = Object.values(cfg.hitTypes).filter((t) => t.afterV.mode === 'st');
  const spins = stTypes.length ? stTypes[0].afterV.spins : null;
  if (spins) {
    const p = cfg.lottery.high[2] / den;
    out.stHitWithin = { spins, p, value: 1 - Math.pow(1 - p, spins) };
  }
  // 次状態へ進む割合（V成功率は盤面物理の結果なので理論値に含めない）
  out.vNote = 'V入賞成功率は盤面の玉の流れ(物理)で決まるため抽選の理論値には含めない。';
  return out;
}

/** 二項分布の標準誤差と95%区間（目安）。 */
export function binomCI(hits, n) {
  if (n === 0) return { p: 0, lo: 0, hi: 0, se: 0 };
  const p = hits / n, se = Math.sqrt((p * (1 - p)) / n);
  return { p, se, lo: Math.max(0, p - 1.96 * se), hi: Math.min(1, p + 1.96 * se) };
}
/** 実測の当たり数が理論値から何σ離れているか。 */
export function zScore(hits, n, pTheory) {
  const sd = Math.sqrt(n * pTheory * (1 - pTheory));
  return sd === 0 ? 0 : (hits - n * pTheory) / sd;
}
export { g as gcd };
