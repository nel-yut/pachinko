// 盤面の描画（読み取り専用）。物理・遊技状態を描くだけで、状態は変更しない。
export function drawBoard(ctx, session, effects, ui) {
  const L = session.layout, P = L.params, sh = session.machine.shutters(), R = P.ballRadius;
  const W = L.width, H = L.height;
  ctx.fillStyle = '#0f1a14'; ctx.fillRect(0, 0, W, H);
  // 盤面の地
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#173a2a'); bg.addColorStop(1, '#0d241a');
  ctx.fillStyle = bg;
  ctx.beginPath(); const { cx, cy, R: rr, laneX } = P.rail;
  ctx.moveTo(laneX, P.rail.laneBottom); ctx.lineTo(laneX, cy); ctx.arc(cx, cy, rr, Math.PI, 0); ctx.lineTo(cx + rr, H); ctx.lineTo(laneX, H); ctx.closePath(); ctx.fill();

  const d = P.display; effects.drawDisplay(ctx, d, ui);

  // 壁・レール
  ctx.lineCap = 'round';
  for (const w of L.walls) {
    ctx.strokeStyle = w.tag === 'outer' || w.tag === 'inner' ? '#c9d3e6' : w.tag === 'display' ? '#5b6b99' : '#8fa0c4';
    ctx.lineWidth = w.tag === 'outer' || w.tag === 'inner' ? 3 : 2.5;
    ctx.beginPath(); ctx.moveTo(w.a[0], w.a[1]); ctx.lineTo(w.b[0], w.b[1]); ctx.stroke();
  }
  // 釘
  ctx.fillStyle = '#e8d9a0';
  for (const p of L.pegs) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }

  // 入賞口・ゲート・機能部品
  const label = (k, text, x, y, color) => { ctx.fillStyle = color; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, x, y); };
  for (const s of L.sensors) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0;
    let color = '#59a1ff';
    if (s.port === 'start1') color = '#ffd24a';
    else if (s.port === 'start2') color = sh.denchuOpen ? '#ffd24a' : '#5a4f2a';
    else if (s.gate) color = '#7be495';
    else if (s.port === 'attacker' || s.port === 'v') color = sh.attackerOpen ? (s.port === 'v' ? (sh.vOpen ? '#ff4d6d' : '#d98aff') : '#ff9f43') : '#4a3a3a';
    ctx.fillStyle = color; ctx.globalAlpha = s.gate ? 0.35 : 0.9; ctx.fillRect(s.x0, s.y0, w, h); ctx.globalAlpha = 1;
  }
  for (const c of L.covers) {
    if (sh[c.closedWhen]) continue; // 開いている
    ctx.strokeStyle = c.tag === 'attackerCover' ? '#b04a4a' : '#a89030'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.a[0], c.a[1]); ctx.lineTo(c.b[0], c.b[1]); ctx.stroke();
  }
  const pt = P.ports;
  label('', '始動1', pt.start1.x, pt.start1.y - 2, '#ffd24a'); label('', '電チュー', pt.start2.x, pt.start2.y - 4, '#d9c36a');
  label('', 'ゲート', pt.gate.x, pt.gate.y - 2, '#7be495'); label('', 'アタッカー/V', pt.attacker.x, pt.attacker.y + 26, '#ff9f43');

  // 玉
  ctx.fillStyle = '#f5f7fb'; ctx.strokeStyle = '#6a7388'; ctx.lineWidth = 1;
  for (const b of session.world.balls) { ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 7); ctx.fill(); ctx.stroke(); }

  // 推奨打ち表示（盤面隅）
  const side = session.machine.recommendedSide();
  ctx.fillStyle = side === 'right' ? '#ff9f43' : '#7be495'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(side === 'right' ? '右打ち ▶' : '◀ 左打ち', W - 8, H - 24 > 0 ? 8 : 8);
  effects.drawOverlay(ctx, { w: W, h: H }, ui);
}
