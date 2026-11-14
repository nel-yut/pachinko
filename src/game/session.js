// 遊技セッション: 物理(PhysicsWorld) と 遊技ロジック(PachinkoMachine) を接続するだけの薄い層。
//   物理 → 「入賞/通過/アウト/戻り」イベント → machine.ballEntered / gatePassed / ballReturned
//   machine → 可動部品(アタッカー/電チュー)の開閉状態 → 物理
// 抽選・賞球・状態遷移は machine 側にのみ存在し、ここには置かない。

import { PachinkoMachine } from '../core/machine.js';
import { PhysicsWorld } from '../physics/world.js';
import { LAYOUTS, DEFAULT_BOARD_PARAMS } from '../physics/layout.js';

export class GameSession {
  constructor(config, { machineRng, physicsRng, allowIssues = false } = {}) {
    this.config = config;
    this.machine = new PachinkoMachine(config, machineRng, { allowIssues });
    const params = { ...DEFAULT_BOARD_PARAMS, ...(config.board.params || {}) };
    const build = LAYOUTS[config.board.layout];
    if (!build) throw new Error(`unknown board layout: ${config.board.layout}`);
    this.layout = build(params);
    this.world = new PhysicsWorld(this.layout, physicsRng);
    this.world.setShutters(this.machine.shutters());
    this.simMs = 0; this.lastFireMs = -1e9;
    this.physicsTerminal = { port: 0, out: 0, return: 0, stuck: 0 };
  }
  get fireIntervalMs() { return this.layout.params.launch.fireIntervalMs; }

  /** 発射間隔を守って1球発射。strength: 0..1。発射できなければ null。 */
  tryFire(strength) {
    if (this.simMs - this.lastFireMs < this.fireIntervalMs) return null;
    const id = this.machine.launch();
    if (id == null) return null;
    this.lastFireMs = this.simMs;
    this.world.launch(id, strength);
    return id;
  }

  /** dtMs 進める（物理は内部で細分化）。 */
  update(dtMs) {
    const dt = dtMs / 1000;
    const events = this.world.step(dt);
    for (const e of events) {
      if (e.type === 'gate') this.machine.gatePassed(e.ballId);
      else if (e.type === 'return') { this.physicsTerminal.return++; this.machine.ballReturned(e.ballId); }
      else if (e.type === 'out') { this.physicsTerminal.out++; if (e.stuck) this.physicsTerminal.stuck++; this.machine.ballEntered(e.ballId, 'out'); }
      else if (e.type === 'port') { this.physicsTerminal.port++; this.machine.ballEntered(e.ballId, e.port); }
    }
    this.machine.advance(dtMs);
    this.simMs += dtMs;
    this.world.setShutters(this.machine.shutters());
    return events;
  }
  get ballsInPlay() { return this.world.balls.length; }
  /** 持ち玉0かつ盤面に玉なし = 遊技終了(玉切れ) */
  get exhausted() { return this.machine.balls.owned <= 0 && this.world.balls.length === 0; }
}
