// 筐体＋盤面の描画（読み取り専用）。物理・遊技状態を描くだけで、状態は変更しない。
// 論理座標 480x760: 盤面 0..640、その下(640..760)に上皿・下皿・ハンドル。
export const CANVAS_W = 480;
export const CANVAS_H = 760;
export const DIAL = { x: 408, y: 702, r: 44 };
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => (d * Math.PI) / 180;

/** ハンドル(ダイヤル)の当たり判定と、座標→強度の換算（マウス/タッチ共通） */
export function dialHit(x, y) { return Math.hypot(x - DIAL.x, y - DIAL.y) <= DIAL.r + 14; }
export function dialStrength(x, y, prev) {
  const a = (Math.atan2(y - DIAL.y, x - DIAL.x) * 180) / Math.PI + 90;   // 真上=0°、時計回りが正
  const phi = ((a + 540) % 360) - 180;
  if (Math.abs(phi) > 135) return prev;                                  // 下側の不感帯は前の値を保つ
  return (phi + 135) / 270;
}

const cache = { key: '', canvas: null };
const anim = {};

export function drawBoard(ctx, session, effects, ui) {
  const L = session.layout, P = L.params, sh = session.machine.shutters();
  const scale = ctx.getTransform().a;
  const key = `${L.pegs.length}:${Math.round(scale * 100)}:${P.lcd.x}`;
  if (cache.key !== key) { cache.canvas = buildStatic(L, P, scale); cache.key = key; }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cache.canvas, 0, 0); ctx.restore();

  const lcd = P.lcd, screen = { x: lcd.x + 8, y: lcd.y + 22, w: lcd.w - 16, h: 160 };
  const glow = effects.bgGlow();
  // レールの発光（状態に応じた色）
  const { cx, cy, R, laneX } = P.rail;
  ctx.save(); ctx.globalAlpha = glow.level; ctx.strokeStyle = glow.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(laneX - 4, P.rail.laneBottom); ctx.lineTo(laneX - 4, cy); ctx.arc(cx, cy, R + 4, Math.PI, 0); ctx.lineTo(cx + R + 4, 560); ctx.stroke(); ctx.restore();

  effects.drawDisplay(ctx, screen, ui);

  // 風車
  for (const m of session.world.wm) drawWindmill(ctx, m);
  // ゲート(チェッカー)
  const gt = P.ports.gate, gf = effects.flash('gate');
  ctx.save(); ctx.translate(gt.x, gt.y);
  ctx.strokeStyle = gf > 0 ? '#fff6a8' : '#9be8a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-gt.w / 2 - 2, 6); ctx.lineTo(-gt.w / 2 - 2, -8); ctx.quadraticCurveTo(0, -20, gt.w / 2 + 2, -8); ctx.lineTo(gt.w / 2 + 2, 6); ctx.stroke();
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#111' : '#fff'; ctx.fillRect(-gt.w / 2 + i * (gt.w / 6), -14 - Math.sin((i / 5) * Math.PI) * 3, gt.w / 6, 4); }
  ctx.restore();

  // ヘソ(特図1)ランプ
  const hs = P.ports.start1, hf = effects.flash('start1');
  lamp(ctx, hs.x, hs.y + 5, 12, hf, '#ffd24a');
  // 一般入賞口ランプ
  const gf2 = effects.flash('general');
  for (const g of P.ports.generals) lamp(ctx, g.x, g.y + 4, 8, gf2, '#6fb4ff');

  // 可動部品: 電チュー(開閉ウイング)・アタッカー(開閉扉)
  for (const d of L.dynamics) {
    const target = sh[d.key] ? 1 : 0;
    anim[d.id] = lerp(anim[d.id] ?? target, target, 0.35);
    const v = anim[d.id];
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = d.id === 'denchu' ? '#ff8fb0' : '#ff9f43'; ctx.lineWidth = d.id === 'denchu' ? 4 : 5;
    d.closed.forEach((c, i) => {
      const o = d.open[i];
      const a = [lerp(c.a[0], o.a[0], v), lerp(c.a[1], o.a[1], v)], b = [lerp(c.b[0], o.b[0], v), lerp(c.b[1], o.b[1], v)];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.6) return;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    ctx.restore();
  }
  const s2 = P.ports.start2, f2 = effects.flash('start2');
  lamp(ctx, s2.x, s2.y + 5, 9, Math.max(f2, sh.denchuOpen ? 0.5 : 0), '#ff6b9a');
  // アタッカー筐体: V ランプとカウンタ
  const at = P.ports.attacker, af = effects.flash('attacker'), snap = ui.snap || {};
  ctx.fillStyle = '#2a1414'; ctx.fillRect(at.x - at.w / 2 - 4, at.y + at.h, at.w + 8, 26);
  ctx.strokeStyle = '#7a3a3a'; ctx.strokeRect(at.x - at.w / 2 - 4, at.y + at.h, at.w + 8, 26);
  lamp(ctx, at.x, at.y + 6, 7, sh.vOpen ? 0.6 + 0.4 * Math.sin(performance.now() / 90) : 0, '#ff3d6a');
  ctx.fillStyle = sh.attackerOpen ? '#ffb86b' : '#6a4a4a'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(snap.jackpot ? `CNT ${snap.jackpot.count}/${snap.jackpot.countMax}` : 'ATTACKER', at.x, at.y + at.h + 15);
  if (af > 0) { ctx.fillStyle = `rgba(255,210,100,${af * 0.5})`; ctx.fillRect(at.x - at.w / 2, at.y, at.w, at.h); }

  // 玉
  for (const b of session.world.balls) ball(ctx, b.x, b.y, P.ballRadius);

  effects.drawYaku(ctx, { lcd });
  drawCabinet(ctx, session, ui, effects);
}

function ball(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0.5, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#d5dbe8'); g.addColorStop(1, '#8a93a8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
function lamp(ctx, x, y, r, level, color) {
  ctx.save();
  if (level > 0) { const g = ctx.createRadialGradient(x, y, 1, x, y, r * 2.6); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = Math.min(1, level); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.fillStyle = level > 0 ? color : '#3a3f55'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.fill(); ctx.restore();
}
function drawWindmill(ctx, m) {
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle);
  const cols = ['#ff5c7a', '#ffd24a', '#4dd2ff', '#7be495'];
  for (let k = 0; k < m.blades; k++) {
    ctx.save(); ctx.rotate((k * 2 * Math.PI) / m.blades);
    ctx.fillStyle = cols[k % cols.length]; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(m.r * 0.7, -m.r * 0.55, m.r, -1); ctx.lineTo(m.r, 2); ctx.quadraticCurveTo(m.r * 0.6, m.r * 0.15, 0, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = '#eaeefc'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill(); ctx.restore();
}

// ---------- 筐体下部: 上皿・下皿・ハンドル ----------
function drawCabinet(ctx, session, ui, effects) {
  const snap = ui.snap || { balls: { owned: 0, payoutTotal: 0 } };
  ctx.fillStyle = '#17121f'; ctx.fillRect(0, 640, CANVAS_W, CANVAS_H - 640);
  const g = ctx.createLinearGradient(0, 640, 0, 760); g.addColorStop(0, '#2b2438'); g.addColorStop(1, '#120e1a');
  ctx.fillStyle = g; ctx.fillRect(0, 640, CANVAS_W, 120);
  ctx.strokeStyle = '#6b5f86'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 641); ctx.lineTo(CANVAS_W, 641); ctx.stroke();
  // 上皿（持ち玉）
  const trayX = 14, trayY = 654, trayW = 252, trayH = 92;
  const tg = ctx.createLinearGradient(0, trayY, 0, trayY + trayH); tg.addColorStop(0, '#3a3450'); tg.addColorStop(1, '#1c1828');
  ctx.fillStyle = tg; roundRect(ctx, trayX, trayY, trayW, trayH, 14); ctx.fill(); ctx.strokeStyle = '#7f739f'; ctx.stroke();
  const owned = snap.balls.owned, n = Math.min(60, Math.ceil(owned / 30));
  for (let i = 0; i < n; i++) { const row = Math.floor(i / 20), col = i % 20; ball(ctx, trayX + 14 + col * 11.6 + (row % 2) * 5, trayY + trayH - 14 - row * 9.5, 4.6); }
  ctx.fillStyle = '#e8eefc'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('上皿 持ち玉', trayX + 10, trayY + 6);
  ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#ffd24a'; ctx.fillText(owned.toLocaleString(), trayX + 10, trayY + 20);
  // 下皿（賞球の累計）
  const dX = 276, dY = 668, dW = 70, dH = 70;
  ctx.fillStyle = '#231d33'; roundRect(ctx, dX, dY, dW, dH, 12); ctx.fill(); ctx.strokeStyle = '#6b5f86'; ctx.stroke();
  ctx.fillStyle = '#9fb0d8'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('賞球 累計', dX + dW / 2, dY + 8);
  ctx.fillStyle = '#7be495'; ctx.font = 'bold 15px system-ui'; ctx.fillText(snap.balls.payoutTotal.toLocaleString(), dX + dW / 2, dY + 24);
  ctx.fillStyle = '#9fb0d8'; ctx.font = '10px system-ui'; ctx.fillText('発射', dX + dW / 2, dY + 44); ctx.fillStyle = '#e8eefc'; ctx.font = 'bold 13px system-ui'; ctx.fillText(String(snap.balls.launched), dX + dW / 2, dY + 56);
  // ハンドル
  const s = ui.strength ?? 0.2;
  ctx.save(); ctx.translate(DIAL.x, DIAL.y);
  // 推奨域(左打ち=緑 / 右打ち=橙)の弧
  const arcZone = (s0, s1, col) => { ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, DIAL.r + 6, rad(-90 - 135 + 270 * s0), rad(-90 - 135 + 270 * s1)); ctx.stroke(); };
  arcZone(0.13, 0.34, '#4fcf7a'); arcZone(0.58, 1, '#ff9f43');
  const dg = ctx.createRadialGradient(-10, -12, 4, 0, 0, DIAL.r); dg.addColorStop(0, '#5a5470'); dg.addColorStop(1, '#1d1a2a');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, DIAL.r, 0, 7); ctx.fill(); ctx.strokeStyle = '#9a8fc0'; ctx.lineWidth = 2; ctx.stroke();
  ctx.rotate(rad(-135 + 270 * s));
  ctx.fillStyle = ui.holding ? '#ff4d6d' : '#d9d2f2'; ctx.beginPath(); ctx.roundRect(-6, -DIAL.r + 4, 12, 26, 6); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#c9c0e6'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('弱', DIAL.x - 40, DIAL.y + 38); ctx.fillText('強', DIAL.x + 40, DIAL.y + 38);
  ctx.fillStyle = ui.holding ? '#ff4d6d' : '#4a4560'; ctx.beginPath(); ctx.arc(DIAL.x, DIAL.y, 6, 0, 7); ctx.fill();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ---------- 静的レイヤー（盤面の地・レール・枠・釘・ポケット） ----------
function buildStatic(L, P, scale) {
  const c = document.createElement('canvas'); c.width = Math.round(CANVAS_W * scale); c.height = Math.round(CANVAS_H * scale);
  const ctx = c.getContext('2d'); ctx.scale(scale, scale);
  const { cx, cy, R, laneX, gap } = P.rail;
  // 筐体の地
  ctx.fillStyle = '#17121f'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // 盤面の地
  const bg = ctx.createLinearGradient(0, 0, 0, 640); bg.addColorStop(0, '#16335f'); bg.addColorStop(0.5, '#0f2a4f'); bg.addColorStop(1, '#0a1c38');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(laneX, P.rail.laneBottom); ctx.lineTo(laneX, cy); ctx.arc(cx, cy, R, Math.PI, 0); ctx.lineTo(cx + R, 640); ctx.lineTo(laneX, 640); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip(); ctx.globalAlpha = 0.07; ctx.strokeStyle = '#9fc0ff'; ctx.lineWidth = 1;
  for (let i = -640; i < 640; i += 22) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 640, 640); ctx.stroke(); }
  ctx.restore();
  // 盤面アート（プレースホルダー: 抽象的な放射模様。版権素材は使わない）
  ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = '#5b7cff';
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(60 + i * 45, 470 + Math.sin(i) * 40, 30 + (i % 3) * 14, 0, 7); ctx.fill(); }
  ctx.restore();
  // 液晶枠（筐体風の金属ベゼル）
  const l = P.lcd, S = P.stage;
  const fg = ctx.createLinearGradient(l.x, l.y, l.x + l.w, l.y + l.h); fg.addColorStop(0, '#5a5a8a'); fg.addColorStop(0.5, '#2c2c4a'); fg.addColorStop(1, '#4a4a72');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(l.x, l.y + 18); ctx.lineTo(l.x + l.w / 2, l.y); ctx.lineTo(l.x + l.w, l.y + 18); ctx.lineTo(l.x + l.w, S.y - 12); ctx.lineTo(l.x, S.y - 12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d0d4ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#05070f'; ctx.fillRect(l.x + 7, l.y + 21, l.w - 14, 162);           // 液晶の黒地（描画は動的）
  // ステージ（床の見た目）
  ctx.fillStyle = '#3d3a66'; ctx.beginPath(); ctx.moveTo(l.x + 4, S.y - 2); ctx.lineTo(168, S.y + 3); ctx.lineTo(l.x + l.w / 2 - S.holeW / 2, S.y + 6); ctx.lineTo(l.x + l.w / 2 - S.holeW / 2, S.y + 14); ctx.lineTo(l.x + 4, S.y + 14); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(l.x + l.w - 4, S.y - 2); ctx.lineTo(312, S.y + 3); ctx.lineTo(l.x + l.w / 2 + S.holeW / 2, S.y + 6); ctx.lineTo(l.x + l.w / 2 + S.holeW / 2, S.y + 14); ctx.lineTo(l.x + l.w - 4, S.y + 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9c0ff'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('STAGE', l.x + l.w / 2, S.y + 22);
  // ワープ入口
  const W = P.warp; ctx.fillStyle = '#7be0c8'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'right'; ctx.fillText('WARP', l.x - 3, W.y - 14);
  ctx.fillStyle = '#7be0c8'; ctx.fillRect(W.x0, W.y + 6, W.x1 - W.x0 + 4, 4);

  // 壁・レール（金属質）
  ctx.lineCap = 'round';
  for (const w of L.walls) {
    const rail = w.tag === 'outer' || w.tag === 'inner', hide = w.tag === 'lcd' || w.tag === 'stage';
    if (hide) continue;
    ctx.strokeStyle = rail ? '#5d6678' : '#4b5470'; ctx.lineWidth = rail ? 6 : 4; ctx.beginPath(); ctx.moveTo(w.a[0], w.a[1]); ctx.lineTo(w.b[0], w.b[1]); ctx.stroke();
    ctx.strokeStyle = rail ? '#dfe6f5' : (w.tag === 'pocket' ? '#8fb4ff' : '#aeb9d6'); ctx.lineWidth = rail ? 2.5 : 1.8; ctx.beginPath(); ctx.moveTo(w.a[0], w.a[1]); ctx.lineTo(w.b[0], w.b[1]); ctx.stroke();
  }
  // ポケット(賞球口)の受け皿とラベル
  for (const g of P.ports.generals) {
    ctx.fillStyle = '#1b2a4a'; ctx.fillRect(g.x - 9, g.y - 1, 18, 14); ctx.strokeStyle = '#6fb4ff'; ctx.lineWidth = 1.5; ctx.strokeRect(g.x - 9, g.y - 1, 18, 14);
  }
  // ヘソ(始動口1)のハウジング
  const hs = P.ports.start1;
  ctx.fillStyle = '#3a2f12'; ctx.beginPath(); ctx.roundRect(hs.x - 20, hs.y - 2, 40, 22, 6); ctx.fill(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('START', hs.x, hs.y + 30);
  // 電チュー(始動口2)の受け口
  const s2 = P.ports.start2;
  ctx.fillStyle = '#3a1226'; ctx.beginPath(); ctx.roundRect(s2.x - 16, s2.y - 1, 32, 18, 5); ctx.fill(); ctx.strokeStyle = '#ff6b9a'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ff9fbd'; ctx.font = 'bold 8px system-ui'; ctx.fillText('電チュー', s2.x, s2.y + 26);
  // アタッカー筐体の枠
  const at = P.ports.attacker;
  ctx.fillStyle = '#331515'; ctx.beginPath(); ctx.roundRect(at.x - at.w / 2 - 8, at.y - 4, at.w + 16, at.h + 34, 4); ctx.fill(); ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd7a8'; ctx.font = 'bold 8px system-ui'; ctx.fillText('ATTACKER / V', at.x, at.y - 9);
  // アウト口
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(240, 645, 44, 10, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#6a7390'; ctx.font = '8px system-ui'; ctx.fillText('OUT', 240, 633);
  // ゲートのラベル
  const gt = P.ports.gate; ctx.fillStyle = '#9be8a8'; ctx.font = 'bold 8px system-ui'; ctx.fillText('ゲート', gt.x, gt.y + 20);

  // 釘（真鍮色・ハイライト付き）
  for (const p of L.pegs) {
    ctx.fillStyle = '#8a6a2a'; ctx.beginPath(); ctx.arc(p.x + 0.6, p.y + 0.8, p.r + 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#f1d98a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.arc(p.x - 0.6, p.y - 0.7, p.r * 0.38, 0, 7); ctx.fill();
  }
  return c;
}
