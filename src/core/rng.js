// 乱数源。本番用(crypto)と検証用(シード付き再現可能)を同一インターフェースで差し替える。
//   { nextUint32(): 0..2^32-1, nextInt(n): 0..n-1 (偏りなし), kind, seed }
// 当落判定は nextInt の整数結果と整数境界の比較のみで行う（浮動小数点比較をしない）。

const TWO32 = 4294967296;

function withNextInt(base) {
  base.nextInt = function nextInt(n) {
    if (!Number.isInteger(n) || n < 1 || n > TWO32) throw new RangeError(`nextInt: invalid n=${n}`);
    if (n === 1) return 0;
    // 棄却法でモジュロバイアスを排除
    const limit = TWO32 - (TWO32 % n);
    let x;
    do { x = this.nextUint32(); } while (x >= limit);
    return x % n;
  };
  return base;
}

export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isInteger(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function splitmix32(a) {
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15; t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** 再現可能なシード付き乱数 (xoshiro128**) */
export function createSeededRng(seed) {
  const sm = splitmix32(hashSeed(seed));
  let s0 = sm(), s1 = sm(), s2 = sm(), s3 = sm();
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  return withNextInt({
    kind: 'seeded', seed,
    nextUint32() {
      const r = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
      const t = s1 << 9;
      s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11);
      return r;
    },
  });
}

/** 本番用乱数 (Web Crypto)。シード指定なし・再現不可。 */
export function createSecureRng() {
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues) throw new Error('Web Crypto が利用できません');
  const buf = new Uint32Array(256); let i = 256;
  return withNextInt({
    kind: 'secure', seed: null,
    nextUint32() {
      if (i >= 256) { c.getRandomValues(buf); i = 0; }
      return buf[i++];
    },
  });
}

/** 同一シードから用途別の独立ストリームを派生（抽選用と到達モデル用を分ける） */
export function deriveSeededRng(seed, label) {
  const r = createSeededRng(`${seed}::${label}`);
  r.seed = seed; r.label = label;
  return r;
}

/** 呼び出し回数を数えるラッパー（「1入賞1抽選」の検証用） */
export function countingRng(inner) {
  const w = {
    kind: inner.kind, seed: inner.seed, calls: 0,
    nextUint32() { w.calls++; return inner.nextUint32(); },
  };
  return withNextInt(w);
}
