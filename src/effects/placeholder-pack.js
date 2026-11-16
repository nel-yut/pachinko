// 演出パック（プレースホルダー）。遊技ロジックのイベントを「見せる」だけで、当落・入賞・賞球に一切関与しない。
// 差し替え方法: 同じインターフェースのオブジェクトを createEffectPack() の代わりに main.js へ渡す。
//   interface EffectPack {
//     id: string
//     onEvent(name, payload): void                 // machine のイベントを受け取る
//     update(dtMs): void
//     drawDisplay(ctx, rect, ui): void             // 液晶の描画。rect={x,y,w,h}（液晶画面領域）
//     drawYaku(ctx, geo, ui): void                 // 大型可動役物（液晶枠の手前に描く）。geo.lcd=枠外形
//     flash(port): number                          // 入賞口ランプの点灯度 0..1（盤面描画が参照）
//     bgGlow(): {color, level}                     // レール等の発光色
//   }
// 版権画像・ロゴは使わず、図形のみ。画像素材に差し替える場合は drawDisplay / drawYaku 内で drawImage する。

const pad = (n) => String(n);
export function createEffectPack() {
  let t = 0;
  const reels = [{ v: 0, spin: false }, { v: 0, spin: false }, { v: 0, spin: false }];
  let plan = null, spinMs = 0, spinTotal = 0, reach = false;
  let banner = null, lastResult = null, spinSp = 0;
  const flashes = {};
  const yaku = { open: 0, target: 0, shake: 0, hold: 0 };
  let mode = 'normal', modeInfo = {};
  const rnd = (n) => Math.floor(Math.random() * n);              // 見た目専用の乱数（ロジックの乱数とは別物）

  const colors = {
    normal: ['#12224a', '#0a1230'], jitan: ['#0e3a3a', '#07201f'], st: ['#4a1020', '#1a0610'], jackpot: ['#5a3a05', '#2a1500'],
  };
  const pack = {
    id: 'placeholder',
    flash(port) { return Math.max(0, flashes[port] || 0); },
    bgGlow() {
      if (mode === 'jackpot') return { color: '#ffd24a', level: 0.6 + 0.4 * Math.sin(t / 90) };
      if (mode === 'st') return { color: '#ff4d6d', level: 0.5 };
      if (mode === 'jitan') return { color: '#4de0c0', level: 0.4 };
      return { color: '#5b7cff', level: 0.12 };
    },
    onEvent(name, p) {
      switch (name) {
        case 'settled': flashes[p.port === 'v' ? 'attacker' : p.port] = 1; break;
        case 'gatePass': flashes.gate = 1; break;
        case 'spinStart': {
          const d = rnd(10);
          let digits;
          if (p.hit) digits = [d, d, d];
          else { const fake = Math.random() < 0.3; digits = fake ? [d, d, (d + 1 + rnd(8)) % 10] : [d, (d + 1 + rnd(8)) % 10, rnd(10)]; if (!fake && digits[2] === digits[0] && digits[1] === digits[0]) digits[2] = (digits[2] + 1) % 10; }
          reach = digits[0] === digits[1];
          plan = { digits, hit: p.hit };
          spinMs = spinTotal = p.duration; spinSp = p.sp;
          reels.forEach((r) => { r.spin = true; });
          lastResult = null;
          yaku.target = (reach && p.duration > 3000) ? 0.55 : 0; yaku.shake = reach ? 1 : 0;
          break;
        }
        case 'spinEnd':
          reels.forEach((r, i) => { r.spin = false; r.v = plan ? plan.digits[i] : r.v; });
          lastResult = p.hit ? 'hit' : 'miss';
          if (!p.hit) yaku.target = 0;
          break;
        case 'jackpotStart': banner = { text: '大 当 た り', sub: p.label, ms: 3000, total: 3000, kind: 'hit' }; yaku.target = 1; yaku.hold = 3200; mode = 'jackpot'; break;
        case 'roundStart': if (p.vRound) banner = { text: 'V を 狙 え !', sub: `ラウンド${p.round}`, ms: 1800, total: 1800, kind: 'v' }; break;
        case 'vAchieved': banner = { text: 'V 入 賞 !', sub: 'ST 確定', ms: 2200, total: 2200, kind: 'v' }; break;
        case 'jackpotEnd': yaku.target = 0; banner = p.next.mode === 'st' ? { text: `ST ${p.next.spins}回`, sub: '突入', ms: 2600, total: 2600, kind: 'st' } : p.next.mode === 'jitan' ? { text: `時短 ${p.next.spins}回`, sub: '右打ち継続', ms: 2400, total: 2400, kind: 'jitan' } : { text: '通 常', sub: '左打ち', ms: 1800, total: 1800, kind: 'normal' }; break;
        case 'modeChange': mode = p.to; if (p.reason === 'st-expired') banner = { text: 'ST 終了', sub: '左打ちへ', ms: 2400, total: 2400, kind: 'end' }; if (p.reason === 'jitan-expired') banner = { text: '時短終了', sub: '左打ちへ', ms: 2000, total: 2000, kind: 'end' }; break;
        default: break;
      }
    },
    update(dtMs) {
      t += dtMs;
      for (const k of Object.keys(flashes)) flashes[k] -= dtMs / 350;
      if (spinMs > 0) {
        spinMs -= dtMs;
        const prog = 1 - Math.max(0, spinMs) / spinTotal;
        if (reels[0].spin && prog >= 0.5) { reels[0].spin = false; reels[0].v = plan.digits[0]; }
        if (reels[1].spin && prog >= 0.68) { reels[1].spin = false; reels[1].v = plan.digits[1]; }
        if (reels[2].spin && prog >= 0.97) { reels[2].spin = false; reels[2].v = plan.digits[2]; }
      }
      if (banner) { banner.ms -= dtMs; if (banner.ms <= 0) banner = null; }
      if (yaku.hold > 0) { yaku.hold -= dtMs; if (yaku.hold <= 0) yaku.target = 0; }
      yaku.open += (yaku.target - yaku.open) * Math.min(1, dtMs / 260);
      yaku.shake = Math.max(0, yaku.shake - dtMs / 4000);
    },
    drawDisplay(ctx, r, ui) {
      const s = ui.snap || {}, m = s.mode || 'normal';
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      const [c1, c2] = colors[m] || colors.normal;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
      // 背景演出（モードごと）
      ctx.globalAlpha = 0.35;
      if (m === 'st' || m === 'jackpot') {
        const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5;
        ctx.strokeStyle = m === 'jackpot' ? '#ffd24a' : '#ff7a8a'; ctx.lineWidth = 3;
        for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8 + t / 3000; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); ctx.lineTo(cx + Math.cos(a) * 220, cy + Math.sin(a) * 220); ctx.stroke(); }
      } else {
        ctx.fillStyle = '#9fb8ff';
        for (let i = 0; i < 26; i++) { const x = r.x + ((i * 97 + t / (30 + (i % 5) * 12)) % r.w), y = r.y + ((i * 53) % r.h); ctx.fillRect(x, y, 1.5, 1.5); }
      }
      ctx.globalAlpha = 1;
      // 上段: 状態表示
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(r.x, r.y, r.w, 20);
      ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const label = m === 'st' ? `ST  残 ${s.stLeft}` : m === 'jitan' ? `時短  残 ${s.jitanLeft}` : m === 'jackpot' ? 'BONUS' : 'NORMAL';
      ctx.fillStyle = m === 'st' ? '#ff9aa8' : m === 'jitan' ? '#7be0c8' : m === 'jackpot' ? '#ffd24a' : '#9fb0d8';
      ctx.fillText(label, r.x + 8, r.y + 10);
      ctx.textAlign = 'right'; ctx.fillStyle = '#cfd8f5'; ctx.fillText(s.spin ? `特図${s.spin.sp} 変動中` : lastResult === 'hit' ? 'HIT' : '', r.x + r.w - 8, r.y + 10);
      // 中段: 3桁の特別図柄
      const w = r.w * 0.27, hh = r.h * 0.46, y0 = r.y + r.h * 0.22, gapx = r.w * 0.035, x00 = r.x + (r.w - (w * 3 + gapx * 2)) / 2;
      reels.forEach((rl, i) => {
        const x0 = x00 + i * (w + gapx);
        const isReachReel = i === 2 && reach && reels[2].spin && !reels[1].spin;
        ctx.fillStyle = 'rgba(2,4,12,.85)'; ctx.fillRect(x0, y0, w, hh);
        ctx.strokeStyle = isReachReel ? `rgba(255,${80 + 80 * Math.sin(t / 60)},80,1)` : (lastResult === 'hit' && !rl.spin ? '#ffd24a' : '#3a4a7a'); ctx.lineWidth = isReachReel ? 3 : 2; ctx.strokeRect(x0, y0, w, hh);
        const slow = isReachReel ? 160 : 55;
        const digit = rl.spin ? Math.floor(t / slow + i * 3) % 10 : rl.v;
        ctx.fillStyle = rl.spin ? '#8fb3ff' : (lastResult === 'hit' ? '#ffd24a' : '#eef2ff');
        ctx.font = `bold ${hh * 0.8}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(digit), x0 + w / 2, y0 + hh / 2 + 3);
      });
      if (reach && spinMs > 0 && reels[2].spin && !reels[1].spin) { ctx.fillStyle = `rgba(255,90,90,${0.6 + 0.4 * Math.sin(t / 70)})`; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('R E A C H', r.x + r.w / 2, y0 - 10); }
      // 下段: 保留 or ラウンド情報
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(r.x, r.y + r.h - 30, r.w, 30);
      const j = s.jackpot;
      if (j) {
        ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`ROUND ${j.round || '-'}/${j.rounds}`, r.x + 8, r.y + r.h - 20);
        ctx.fillText(`COUNT ${j.count}/${j.countMax}`, r.x + 8, r.y + r.h - 7);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(`${pad(j.payout)} 個`, r.x + r.w - 8, r.y + r.h - 20);
        if (j.vOpen) { ctx.fillStyle = `rgba(255,77,109,${0.6 + 0.4 * Math.sin(t / 80)})`; ctx.fillText('V ZONE', r.x + r.w - 8, r.y + r.h - 7); }
      } else {
        const dot = (x, y, on, col) => { ctx.fillStyle = on ? col : '#2a3560'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); };
        ctx.fillStyle = '#9fb0d8'; ctx.font = '10px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('特図1', r.x + 8, r.y + r.h - 20); ctx.fillText('特図2', r.x + 8, r.y + r.h - 7);
        for (let i = 0; i < 4; i++) { dot(r.x + 52 + i * 15, r.y + r.h - 20, i < (s.holds?.[1] || 0), '#ffd24a'); dot(r.x + 52 + i * 15, r.y + r.h - 7, i < (s.holds?.[2] || 0), '#ff6b8b'); }
        ctx.textAlign = 'right'; ctx.fillStyle = '#cfd8f5'; ctx.font = '11px system-ui';
        ctx.fillText(s.side === 'right' ? '右打ち ▶' : '◀ 左打ち', r.x + r.w - 8, r.y + r.h - 14);
      }
      // バナー
      if (banner) {
        const a = Math.min(1, banner.ms / 350, (banner.total - banner.ms) / 150 + 0.2);
        const col = { hit: '#ff4d6d', v: '#ffd24a', st: '#4dd2ff', jitan: '#7be495', normal: '#cfd8f5', end: '#cfd8f5' }[banner.kind] || '#fff';
        ctx.globalAlpha = 0.9 * Math.max(0, a); ctx.fillStyle = 'rgba(4,6,16,.78)'; ctx.fillRect(r.x, r.y + r.h * 0.3, r.w, r.h * 0.34);
        ctx.fillStyle = col; ctx.font = `bold ${r.h * 0.17}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(banner.text, r.x + r.w / 2, r.y + r.h * 0.44); ctx.font = `${r.h * 0.07}px system-ui`; ctx.fillStyle = '#fff'; ctx.fillText(banner.sub || '', r.x + r.w / 2, r.y + r.h * 0.56);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
    /** 大型可動役物（演出専用）。液晶枠の手前で左右の翼と上部の紋章が動く。判定には一切関与しない。 */
    drawYaku(ctx, geo) {
      const L = geo.lcd, o = yaku.open, sh = yaku.shake * Math.sin(t / 35) * 1.5;
      const wing = (px, py, dir) => {
        // 回転軸 (px,py) を中心に、閉じている時は枠の肩に畳まれ、開くと液晶を覆う方向へ振り出す
        ctx.save(); ctx.translate(px + sh, py); ctx.rotate(dir * (1.5 - o * 1.5 + 0.04 * Math.sin(t / 180))); ctx.scale(0.45 + 0.55 * o, 0.7 + 0.3 * o);
        const gr = ctx.createLinearGradient(0, 0, dir * 120, 0); gr.addColorStop(0, '#6d7aa8'); gr.addColorStop(1, '#2b3560');
        ctx.fillStyle = gr; ctx.strokeStyle = '#c7d2ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(dir * 118, -24); ctx.lineTo(dir * 96, 4); ctx.lineTo(dir * 122, 30); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(0, 3, 7, 0, 7); ctx.fill(); ctx.restore();
      };
      wing(L.x + 6, L.y + 30, 1); wing(L.x + L.w - 6, L.y + 30, -1);
      // 上部の紋章: 通常は枠の上に収まり、開放時に降りてくる
      const ey = L.y - 14 + o * 66 + sh, ex = L.x + L.w / 2;
      ctx.save(); ctx.translate(ex, ey); ctx.scale(0.6 + 0.4 * o, 0.6 + 0.4 * o); ctx.rotate(t / 1500 * (0.3 + o * 2));
      ctx.fillStyle = o > 0.5 ? '#ffd24a' : '#8e9bd0'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, rr = i % 2 ? 14 : 26; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    },
  };
  return pack;
}
