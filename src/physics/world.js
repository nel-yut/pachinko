// 盤面物理。玉(円)と 壁(線分)・釘(円) の衝突、重力、入賞センサー判定を行う。
// 抽選や賞球は一切知らない。出力は「どの玉がどの口に入った/通過した/アウトになった」というイベントだけ。
// 玉同士の衝突は扱わない（軽量化のための簡略化。ドキュメントに明記）。

const CELL = 24;

export class PhysicsWorld {
  constructor(layout, rng) {
    this.layout = layout; this.P = layout.params; this.rng = rng;
    this.balls = [];
    this.shutters = { attackerOpen: false, denchuOpen: false, vOpen: false };
    this.time = 0;
    this.wm = layout.windmills.map((m) => ({ ...m, angle: 0, omega: 0 }));
    this._buildGrid();
  }
  _buildGrid() {
    const { walls, pegs } = this.layout, m = this.P.ballRadius + 6;
    this.cols = Math.ceil(this.layout.width / CELL) + 1; this.rows = Math.ceil(this.layout.height / CELL) + 1;
    this.grid = Array.from({ length: this.cols * this.rows }, () => ({ w: [], p: [] }));
    const put = (x0, y0, x1, y1, kind, item) => {
      const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - m) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((Math.max(x0, x1) + m) / CELL));
      const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - m) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((Math.max(y0, y1) + m) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.grid[r * this.cols + c][kind].push(item);
    };
    for (const w of walls) put(w.a[0], w.a[1], w.b[0], w.b[1], 'w', w);
    for (const p of pegs) put(p.x, p.y, p.x, p.y, 'p', p);
  }

  setShutters(s) { Object.assign(this.shutters, s); }

  /** strength: 0..1。初速 = vMin..vMax。 */
  launch(id, strength) {
    const L = this.P.launch, { laneX, gap, laneBottom } = this.P.rail;
    const j = 1 + (this.rng.nextInt(20001) - 10000) / 10000 * L.jitter;
    const st = Math.min(1, Math.max(0, strength)), c = L.curve;
    // 強度→初速。左打ち域(弱め)を広く取るため区分線形
    const base = c ? (st <= c[1][0] ? c[0][1] + ((c[1][1] - c[0][1]) * st) / c[1][0] : c[1][1] + ((c[2][1] - c[1][1]) * (st - c[1][0])) / (1 - c[1][0])) : L.vMin + (L.vMax - L.vMin) * st;
    const v = base * j;
    const b = { id, x: laneX + gap / 2, y: laneBottom - 12, vx: 0, vy: -v, age: 0, still: 0, gates: new Set(), strength };
    this.balls.push(b);
    return b;
  }

  /** dt 秒だけ進め、確定イベントの配列を返す。 */
  step(dt) {
    const events = [], P = this.P, g = P.gravity;
    const sub = Math.max(1, Math.ceil(dt / (1 / 600))), h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.time += h;
      for (const m of this.wm) { m.angle += m.omega * h; m.omega *= 1 - 0.9 * h; }
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        b.vy += g * h; b.x += b.vx * h; b.y += b.vy * h; b.age += h;
        this._collide(b);
        const ev = this._sense(b);
        if (ev) { if (ev.terminal) { this.balls.splice(i, 1); } events.push(ev); }
      }
    }
    return events;
  }

  _collide(b) {
    const P = this.P, R = P.ballRadius, e = P.restitution, td = P.tangentDamping;
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(b.x / CELL))), r = Math.min(this.rows - 1, Math.max(0, Math.floor(b.y / CELL)));
    const cell = this.grid[r * this.cols + c];
    const resolve = (nx, ny, pen) => {
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
        const nvn = -vn * e, nvt = vt * (1 - td);
        b.vx = nvn * nx + nvt * tx; b.vy = nvn * ny + nvt * ty;
      }
    };
    const seg = (a, bb) => {
      const abx = bb[0] - a[0], aby = bb[1] - a[1];
      if (abx * abx + aby * aby < 1e-6) return;
      let t = ((b.x - a[0]) * abx + (b.y - a[1]) * aby) / (abx * abx + aby * aby);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a[0] + abx * t, py = a[1] + aby * t, dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1e-6;
        // 線分のどちら側にいるかが曖昧な場合に備え、法線は玉中心→最近接点の反対方向
        resolve(dx / d, dy / d, R - d);
      }
    };
    for (const w of cell.w) seg(w.a, w.b);
    for (const p of cell.p) {
      const dx = b.x - p.x, dy = b.y - p.y, rr = R + p.r, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-6; resolve(dx / d, dy / d, rr - d); }
    }
    for (const d of this.layout.dynamics) for (const sg of this.shutters[d.key] ? d.open : d.closed) seg(sg.a, sg.b);
    for (const m of this.wm) this._windmill(b, m);
    // 外レール外へ出た玉を押し戻す安全策（トンネリング対策）
    if (b.x < R) { b.x = R; if (b.vx < 0) b.vx = -b.vx * e; }
    if (b.x > this.layout.width - R) { b.x = this.layout.width - R; if (b.vx > 0) b.vx = -b.vx * e; }
  }

  /** 風車: 回転する羽根(線分)との衝突。羽根の速度を考慮し、玉から受けた力積で角速度が変わる。 */
  _windmill(b, m) {
    const R = this.P.ballRadius, e = this.P.restitution;
    if (Math.hypot(b.x - m.x, b.y - m.y) > m.r + R + 2) return;
    for (let k = 0; k < m.blades; k++) {
      const ang = m.angle + (k * 2 * Math.PI) / m.blades, tx = m.x + Math.cos(ang) * m.r, ty = m.y + Math.sin(ang) * m.r;
      const abx = tx - m.x, aby = ty - m.y;
      let t = ((b.x - m.x) * abx + (b.y - m.y) * aby) / (abx * abx + aby * aby); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = m.x + abx * t, py = m.y + aby * t, dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
      b.x += nx * (R - d); b.y += ny * (R - d);
      const rx = px - m.x, ry = py - m.y, wvx = -m.omega * ry, wvy = m.omega * rx;
      const rvn = (b.vx - wvx) * nx + (b.vy - wvy) * ny;
      if (rvn < 0) {
        const J = -(1 + e) * rvn;
        b.vx += J * nx; b.vy += J * ny;
        m.omega += (-J * (rx * ny - ry * nx)) / 1800;
        if (m.omega > 14) m.omega = 14; else if (m.omega < -14) m.omega = -14;
      }
    }
  }

  _sense(b) {
    const { laneX, gap, laneBottom } = this.P.rail;
    // 発射レール内で下に戻った玉
    if (b.x < laneX + gap + 2 && b.y > laneBottom - 8 && b.vy > 0 && b.age > 0.2) return { type: 'return', ballId: b.id, terminal: true };
    if (b.y > this.layout.height + 10) return { type: 'out', ballId: b.id, terminal: true };
    for (const s of this.layout.sensors) {
      if (b.x < s.x0 || b.x > s.x1 || b.y < s.y0 || b.y > s.y1) continue;
      if (s.requires && !this.shutters[s.requires]) continue;
      if (s.gate) {
        if (b.gates.has(s)) continue;
        b.gates.add(s);
        return { type: 'gate', ballId: b.id, terminal: false };
      }
      return { type: 'port', port: s.port, sensorId: s.id, ballId: b.id, terminal: true };
    }
    // ワープ: 液晶枠の入口に入った玉をステージへ移す（見た目はワープ演出、物理上は位置の瞬間移動）
    const w = this.P.warp;
    if (!b.warped && b.x > w.x0 && b.x < w.x1 && b.y > w.y - 12 && b.y < w.y + 10) {
      b.warped = true; const L = this.P.lcd;
      b.x = L.x + 14 + (this.rng.nextInt(1000) / 1000) * 10; b.y = this.P.stage.y - 8; b.vx = 70 + this.rng.nextInt(60); b.vy = 0;
      return { type: 'warp', ballId: b.id, terminal: false };
    }
    // 滞留・長時間の玉はアウト扱い（盤面詰まり防止）
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    b.still = sp2 < 25 ? b.still + 1 : 0;
    if (b.still > 600 * 2.5 || b.age > 45) return { type: 'out', ballId: b.id, terminal: true, stuck: true };
    return null;
  }
}
