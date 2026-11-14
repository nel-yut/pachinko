// 最小のイベントエミッター（遊技ロジック→UI/演出/集計への一方向通知に使う）
export class Emitter {
  #h = new Map();
  on(name, fn) {
    if (!this.#h.has(name)) this.#h.set(name, []);
    this.#h.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const a = this.#h.get(name);
    if (a) this.#h.set(name, a.filter((f) => f !== fn));
  }
  emit(name, payload) {
    const a = this.#h.get(name);
    if (a) for (const f of a) f(payload);
    const all = this.#h.get('*');
    if (all) for (const f of all) f(name, payload);
  }
}
