// 演出パック（プレースホルダー）。遊技ロジックのイベントを「見せる」だけで、当落・入賞・賞球に一切関与しない。
// 差し替え方法: 同じインターフェースのオブジェクトを createEffectPack() の代わりに main.js へ渡す。
//   interface EffectPack {
//     id: string
//     onEvent(name, payload): void      // machine のイベントを受け取る
//     update(dtMs): void
//     drawDisplay(ctx, rect, ui): void  // 盤面中央の表示エリア(rect={x,y,w,h})に描画。画像素材もここで描く
//     drawOverlay(ctx, size, ui): void  // 盤面全体の前面演出（バナー等）
//   }
// 版権画像・ロゴは使わず、図形のみで構成している。

export function createEffectPack() {
  let t = 0;
  const reels = [{ v: 0, spin: false }, { v: 0, spin: false }, { v: 0, spin: false }];
  let spinMs = 0, spinTotal = 0, plan = null, stopped = 0;
  let banner = null; // {text, ms}
  let yaku = { phase: 0, speed: 0.6, target: 0.6, flash: 0 }; // 役物の動き（演出のみ）
  let lastResult = null;
  const cosmetic = () => Math.floor(Math.random() * 10); // 見た目用の乱数。ロジックの乱数とは別物

  const pack = {
    id: 'placeholder',
    onEvent(name, p) {
      switch (name) {
        case 'spinStart': {
          // 結果(hit)は入賞時に確定済みのものを「表示」するだけ
          const d = cosmetic();
          const finalDigits = p.hit ? [d, d, d] : (() => { let a = cosmetic(), b = cosmetic(), c = cosmetic(); if (a === b && b === c) c = (c + 1 + Math.floor(Math.random() * 8)) % 10; return [a, b, c]; })();
          plan = { digits: finalDigits, hit: p.hit, sp: p.sp };
          spinMs = spinTotal = p.duration; stopped = 0;
          reels.forEach((r) => { r.spin = true; });
          yaku.target = p.hit ? 3.2 : 1.6;
          break;
        }
        case 'spinEnd':
          reels.forEach((r, i) => { r.spin = false; r.v = plan ? plan.digits[i] : r.v; });
          lastResult = p.hit ? 'hit' : 'miss'; yaku.target = 0.6;
          break;
        case 'jackpotStart': banner = { text: `大当たり  ${p.label}`, ms: 2500, kind: 'hit' }; yaku.target = 4; yaku.flash = 1; break;
        case 'roundStart': if (p.vRound) banner = { text: 'V入賞チャンス!', ms: 1600, kind: 'v' }; break;
        case 'vAchieved': banner = { text: 'V入賞!  ST確定', ms: 2000, kind: 'v' }; break;
        case 'jackpotEnd': yaku.target = 0.6; if (p.next.mode === 'st') banner = { text: `ST突入 ${p.next.spins}回`, ms: 2500, kind: 'st' }; else if (p.next.mode === 'jitan') banner = { text: `時短 ${p.next.spins}回`, ms: 2200, kind: 'jitan' }; else banner = { text: '通常へ', ms: 1500, kind: 'normal' }; break;
        case 'modeChange': if (p.reason === 'st-expired') banner = { text: 'ST終了', ms: 2200, kind: 'end' }; if (p.reason === 'jitan-expired') banner = { text: '時短終了', ms: 1800, kind: 'end' }; break;
        case 'denchu': break;
        default: break;
      }
    },
    update(dtMs) {
      t += dtMs;
      if (spinMs > 0) {
        spinMs -= dtMs;
        const prog = 1 - Math.max(0, spinMs) / spinTotal;
        const stopAt = [0.78, 0.88, 0.97];
        reels.forEach((r, i) => { if (r.spin && prog >= stopAt[i]) { r.spin = false; r.v = plan.digits[i]; } });
      }
      if (banner) { banner.ms -= dtMs; if (banner.ms <= 0) banner = null; }
      yaku.speed += (yaku.target - yaku.speed) * Math.min(1, dtMs / 300);
      yaku.phase += (yaku.speed * dtMs) / 1000;
      yaku.flash = Math.max(0, yaku.flash - dtMs / 1500);
    },
    drawDisplay(ctx, r, ui) {
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, '#16213e'); g.addColorStop(1, '#0b1020');
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
      // 役物（演出用の大型可動部品。物理・判定には関与しない）
      const cx = r.x + r.w / 2, cy = r.y + r.h * 0.38, a = yaku.phase;
      ctx.strokeStyle = `rgba(255,${180 - 120 * yaku.flash | 0},60,${0.35 + 0.4 * yaku.flash})`; ctx.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        const ang = a + (i * Math.PI) / 2, len = r.w * (0.34 + 0.06 * Math.sin(a * 2 + i));
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.62); ctx.stroke();
        ctx.fillStyle = '#ffcc55'; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.62, 6, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#2b3a67'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 7); ctx.fill();
      // 特別図柄（3桁）
      const w = r.w / 3.6, hh = r.h * 0.34, y0 = r.y + r.h * 0.6;
      reels.forEach((rl, i) => {
        const x0 = r.x + r.w * 0.08 + i * (w + r.w * 0.04);
        ctx.fillStyle = '#05080f'; ctx.fillRect(x0, y0, w, hh);
        ctx.strokeStyle = lastResult === 'hit' && !rl.spin ? '#ffd24a' : '#3a4a7a'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, w, hh);
        const digit = rl.spin ? Math.floor(t / 55 + i * 3) % 10 : rl.v;
        ctx.fillStyle = rl.spin ? '#8fb3ff' : (lastResult === 'hit' ? '#ffd24a' : '#e8eefc');
        ctx.font = `bold ${hh * 0.78}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(digit), x0 + w / 2, y0 + hh / 2 + 2);
      });
      ctx.fillStyle = '#9fb0d8'; ctx.font = `${r.h * 0.07}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(ui.spinLabel, r.x + 6, r.y + 5);
      ctx.restore();
    },
    drawOverlay(ctx, size) {
      if (!banner) return;
      const colors = { hit: '#ff4d6d', v: '#ffd24a', st: '#4dd2ff', jitan: '#7be495', normal: '#9aa7c7', end: '#9aa7c7' };
      const a = Math.min(1, banner.ms / 400);
      ctx.save(); ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = 'rgba(8,12,24,.82)'; ctx.fillRect(0, size.h * 0.43, size.w, 54);
      ctx.fillStyle = colors[banner.kind] || '#fff'; ctx.font = 'bold 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.text, size.w / 2, size.h * 0.43 + 27);
      ctx.restore();
    },
  };
  return pack;
}
