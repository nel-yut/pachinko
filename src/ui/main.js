// 画面制御: 入力(マウス/タッチ共通のPointer Events)、ゲームループ、HUD、台設定UI。
// 遊技ロジックは GameSession/PachinkoMachine 側にあり、ここは入力を渡して状態を表示するだけ。
import { PRESETS, getPreset } from '../presets/index.js';
import { validateConfig } from '../core/config-validate.js';
import { createSecureRng, deriveSeededRng } from '../core/rng.js';
import { GameSession } from '../game/session.js';
import { createEffectPack } from '../effects/placeholder-pack.js';
import { drawBoard, dialHit, dialStrength, CANVAS_W, CANVAS_H } from './render.js';
import { FEATURES } from '../config/features.js';
import { theory } from '../verify/theory.js';

const $ = (id) => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const LEFT_STRENGTH = 0.22, RIGHT_STRENGTH = 0.75;
const MODE_LABEL = { normal: '通常(低確率)', jitan: '時短中', st: 'ST中(高確率)', jackpot: '大当たり中' };

let session = null, effects = createEffectPack(), config = null, issues = [];
let holding = false, counters = null, ui = { spinLabel: '', snap: null, strength: 0.22, holding: false };
const logEl = $('log');

if (FEATURES.verification) $('verifyLink').hidden = false;

// ---------- 台設定 ----------
const profileSel = $('profile');
for (const p of PRESETS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; profileSel.appendChild(o); }
const fields = { f_den: ['lottery', 'den'], f_low1: ['lottery', 'low', '1'], f_low2: ['lottery', 'low', '2'], f_high1: ['lottery', 'high', '1'], f_high2: ['lottery', 'high', '2'], f_att: ['payouts', 'attacker'], f_balls: ['balls', 'initial'] };
const getPath = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { let a = o; for (const k of p.slice(0, -1)) a = a[k]; a[p[p.length - 1]] = v; };

function loadProfile(id) {
  config = structuredClone(getPreset(id));
  syncForm();
}
function syncForm() {
  for (const [id, path] of Object.entries(fields)) $(id).value = getPath(config, path) ?? '';
  $('json').value = JSON.stringify(config, null, 2);
}
for (const id of Object.keys(fields)) {
  $(id).addEventListener('change', () => {
    try { config = JSON.parse($('json').value); } catch { /* JSON不正は適用時に指摘 */ }
    const v = $(id).value === '' ? null : Number($(id).value);
    setPath(config, fields[id], v); $('json').value = JSON.stringify(config, null, 2);
  });
}
profileSel.addEventListener('change', () => { loadProfile(profileSel.value); start(); });
$('resetBtn').addEventListener('click', () => { loadProfile(profileSel.value); start(); });
$('applyBtn').addEventListener('click', () => {
  try { config = JSON.parse($('json').value); } catch (e) { showIssues([{ level: 'error', path: 'JSON', message: `JSON構文エラー: ${e.message}` }]); return; }
  syncForm(); start();
});

function showIssues(list) {
  issues = list; const ul = $('issues'); ul.innerHTML = '';
  for (const i of list.slice(0, 60)) { const li = document.createElement('li'); li.className = i.level; li.textContent = `[${i.level === 'unconfirmed' ? '未確定' : 'エラー'}] ${i.path}: ${i.message}`; ul.appendChild(li); }
  if (list.length > 60) { const li = document.createElement('li'); li.textContent = `…ほか ${list.length - 60} 件`; ul.appendChild(li); }
}

// ---------- 開始 ----------
function start() {
  const list = validateConfig(config);
  showIssues(list);
  session = null; logEl.innerHTML = ''; effects = createEffectPack();
  $('theory').textContent = '';
  if (list.length) { document.querySelector('details.panel').open = true; render(); updateHud(); return; }
  const seedText = $('f_seed').value.trim();
  const rng = (label) => (seedText ? deriveSeededRng(seedText, label) : createSecureRng());
  session = new GameSession(config, { machineRng: rng('machine'), physicsRng: rng('physics') });
  counters = { start1: 0, start2: 0, general: 0, attacker: 0, v: 0, out: 0, returned: 0, rejected: 0, over: 0 };
  session.machine.on('*', onMachineEvent);
  const th = theory(config);
  $('theory').textContent = `表示スペック: 低確率 ${config.display?.lowText ?? ''} / 高確率 ${config.display?.highText ?? ''}。抽選は始動口入賞時のみ。乱数: ${seedText ? `検証用シード「${seedText}」(再現可能)` : '本番用(crypto)'}。理論 特図1低確率 ${th.sp[1].low.text}`;
  render(); updateHud();
}

function logLine(t) {
  const li = document.createElement('li'); li.textContent = `${(session.machine.now / 1000).toFixed(1)}s ${t}`; logEl.prepend(li);
  while (logEl.children.length > 60) logEl.lastChild.remove();
}
function onMachineEvent(name, p) {
  effects.onEvent(name, p);
  switch (name) {
    case 'settled': if (counters[p.port] !== undefined) counters[p.port]++; break;
    case 'out': counters.out++; break;
    case 'returned': counters.returned++; break;
    case 'holdRejected': counters.rejected++; logLine(`特図${p.sp} 保留満杯（抽選なし）`); break;
    case 'attackerHit': if (p.over) { counters.over++; logLine(`オーバー入賞 R${p.round}`); } break;
    case 'lottery': logLine(`特図${p.sp} 入賞→抽選 ${p.probMode === 'high' ? '高' : '低'}確率 ${p.num}/${p.den} → ${p.hit ? '当たり(' + p.type + ')' : '外れ'}`); break;
    case 'spinStart': ui.spinLabel = `特図${p.sp} 変動中`; break;
    case 'spinEnd': ui.spinLabel = p.hit ? '当たり!' : ''; break;
    case 'jackpotStart': logLine(`大当たり ${p.label} (${p.origin})`); break;
    case 'vAchieved': logLine('V入賞'); break;
    case 'jackpotEnd': logLine(`大当たり終了 獲得${p.total.payout}個 (オーバー${p.total.over}) → ${p.next.mode}${p.next.spins ? ' ' + p.next.spins + '回' : ''}`); break;
    case 'modeChange': if (p.reason.endsWith('expired')) logLine(`${p.from}終了 → 通常`); break;
    case 'denchu': logLine(`電チュー ${p.open ? '開' : '閉'}`); break;
    default: break;
  }
}

// ---------- 入力（マウス/タッチ共通） ----------
const strengthEl = $('strength');
const setStrength = (v) => { strengthEl.value = v; $('strengthOut').textContent = Number(v).toFixed(2); ui.strength = Number(v); };
strengthEl.addEventListener('input', () => setStrength(strengthEl.value));
$('leftBtn').addEventListener('click', () => { $('auto').checked = false; setStrength(LEFT_STRENGTH); });
$('rightBtn').addEventListener('click', () => { $('auto').checked = false; setStrength(RIGHT_STRENGTH); });
const fireBtn = $('fireBtn');
const press = (on) => { holding = on; ui.holding = on; fireBtn.classList.toggle('on', on); };
fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); fireBtn.setPointerCapture?.(e.pointerId); press(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) fireBtn.addEventListener(ev, () => press(false));
fireBtn.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); press(true); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') press(false); });
// ハンドル(盤面下のダイヤル)を握って回す = 発射。マウス/タッチ共通の Pointer Events。
let dragging = false;
const toLogical = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H]; };
canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = toLogical(e);
  if (dialHit(x, y)) { dragging = true; canvas.setPointerCapture?.(e.pointerId); $('auto').checked = false; setStrength(dialStrength(x, y, Number(strengthEl.value))); press(true); e.preventDefault(); }
});
canvas.addEventListener('pointermove', (e) => { if (dragging) { const [x, y] = toLogical(e); setStrength(dialStrength(x, y, Number(strengthEl.value))); } });
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { if (dragging) { dragging = false; press(false); } });

// ---------- ループ ----------
function resizeCanvas() {
  const dpr = Math.min(3, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
  const w = Math.max(240, Math.round(r.width * dpr)), h = Math.round((w * CANVAS_H) / CANVAS_W);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function render() {
  resizeCanvas();
  ctx.setTransform(canvas.width / CANVAS_W, 0, 0, canvas.height / CANVAS_H, 0, 0);
  if (!session) {
    ctx.fillStyle = '#1a1020'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#ffb86b'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('この台設定では遊技を開始できません', 240, 280);
    ctx.font = '13px system-ui'; ctx.fillStyle = '#e8eefc';
    ctx.fillText(`設定の不整合・未確定値が ${issues.length} 件あります`, 240, 310);
    ctx.fillText('「台設定」パネルの一覧を確認してください', 240, 332);
    return;
  }
  ui.snap = session.machine.snapshot();
  drawBoard(ctx, session, effects, ui);
}
let lastT = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.min(50, now - lastT); lastT = now;
  if (session) {
    const speed = Number($('speed').value);
    let remain = dt * speed;
    const m = session.machine;
    while (remain > 0) {
      const step = Math.min(1000 / 60, remain); remain -= step;
      const auto = $('auto').checked;
      if (auto || holding) {
        const s = auto ? (m.recommendedSide() === 'left' ? LEFT_STRENGTH : RIGHT_STRENGTH) : Number(strengthEl.value);
        if (auto) setStrength(s);
        session.tryFire(s);
      }
      session.update(step); effects.update(step);
    }
  }
  render();
  if (now - hudT > 100) { hudT = now; updateHud(); }
  requestAnimationFrame(frame);
}
function pips(el, n, max) {
  if (el.childElementCount !== max) { el.innerHTML = ''; for (let i = 0; i < max; i++) { const s = document.createElement('i'); s.className = 'pip'; el.appendChild(s); } }
  [...el.children].forEach((c, i) => c.classList.toggle('on', i < n));
}
function updateHud() {
  if (!session) { $('owned').textContent = '-'; return; }
  const s = session.machine.snapshot(), m = session.machine, max = config.holds.max;
  $('owned').textContent = s.balls.owned.toLocaleString();
  $('launched').textContent = s.balls.launched.toLocaleString();
  $('payout').textContent = s.balls.payoutTotal.toLocaleString();
  $('mode').textContent = session.exhausted ? '玉切れ(遊技終了)' : MODE_LABEL[s.mode];
  $('remain').textContent = s.mode === 'st' ? `ST ${s.stLeft}` : s.mode === 'jitan' ? `時短 ${s.jitanLeft}` : '-';
  const j = s.jackpot;
  $('round').textContent = j ? `${j.round}/${j.rounds}R ${j.count}/${j.countMax}${j.vOpen ? ' V' : ''}` : '-';
  pips($('hold1'), s.holds[1], max[1]); pips($('hold2'), s.holds[2], max[2]);
  $('spin1').textContent = s.spin?.sp === 1 ? '変動中' : ''; $('spin2').textContent = s.spin?.sp === 2 ? '変動中' : '';
  const c = counters;
  $('entries').textContent = `始動1:${c.start1} 始動2:${c.start2} 一般:${c.general} ｱﾀｯｶｰ:${c.attacker + c.v}(ｵｰﾊﾞｰ${c.over}) ｱｳﾄ:${c.out}`;
  $('side').textContent = j ? '右打ち（アタッカー狙い）' : s.side === 'right' ? '右打ち' : '左打ち';
  void m;
}
addEventListener('resize', render);

loadProfile('sample-st');
profileSel.value = 'sample-st';
start();
requestAnimationFrame(frame);
