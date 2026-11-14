// 検証CLI: node scripts/verify.mjs [--seed N] [--draws N] [--launches N] [--profile id] [--json] [--out file]
import { writeFileSync } from 'node:fs';
import { buildReport, formatReport } from '../src/verify/report.js';
import { getPreset } from '../src/presets/index.js';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
const profile = getPreset(opt('profile', 'sample-st'));
if (!profile) { console.error('unknown profile'); process.exit(2); }
const rep = buildReport(profile, { seed: Number(opt('seed', 1)), draws: Number(opt('draws', 1000000)), launches: Number(opt('launches', 200000)), onProgress: (m) => console.error(`... ${m}`) });
const out = a.includes('--json') ? JSON.stringify(rep, null, 2) : formatReport(rep);
if (opt('out')) writeFileSync(opt('out'), out); else console.log(out);
const failed = rep.blocked || (rep.rules || []).some((r) => !r.pass);
process.exit(failed ? 1 : 0);
