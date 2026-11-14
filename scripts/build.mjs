// 静的配布物を dist/ に作る（インフラは触らない）。
//   node scripts/build.mjs             検証機能あり（リリース前）
//   node scripts/build.mjs --no-verify 検証画面・検証コードを配布物から除外（公開版）
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const noVerify = process.argv.includes('--no-verify');
rmSync('dist', { recursive: true, force: true }); mkdirSync('dist', { recursive: true });
cpSync('src', 'dist/src', { recursive: true });
for (const f of ['index.html', 'verify.html', 'styles.css']) cpSync(f, `dist/${f}`);
if (noVerify) {
  rmSync('dist/verify.html'); rmSync('dist/src/verify', { recursive: true }); rmSync('dist/src/ui/verify-main.js', { force: true });
  writeFileSync('dist/src/config/features.js', 'export const FEATURES = { verification: false };\n');
  // UI から検証コードへの依存(理論値表示)を無効化
  const p = 'dist/src/ui/main.js';
  writeFileSync(p, readFileSync(p, 'utf8').replace("import { theory } from '../verify/theory.js';\n", "const theory = () => ({ sp: { 1: { low: { text: '' } } } });\n"));
}
console.log(`dist/ を作成しました (verification=${!noVerify})`);
