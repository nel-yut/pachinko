// 抽選の純関数。すべて整数の分子/分母・整数重みで判定する。

/** 当たり判定: 0..den-1 の乱数値が num 未満なら当たり（境界: 当たり値は 0..num-1）。 */
export function drawProbability(rng, num, den) {
  if (!Number.isInteger(num) || !Number.isInteger(den) || den < 1 || num < 0 || num > den) {
    throw new RangeError(`invalid probability ${num}/${den}`);
  }
  return rng.nextInt(den) < num;
}

/** 整数重みによる振分。entries: [{weight:int}]、total は重み合計（設定検証済みであること）。 */
export function pickWeighted(rng, entries, total) {
  let r = rng.nextInt(total);
  for (const e of entries) {
    if (r < e.weight) return e;
    r -= e.weight;
  }
  throw new Error('pickWeighted: weights do not cover total');
}
