// 検証をバックグラウンドで実行（画面を固めない）。
import { buildReport, formatReport } from './report.js';
self.onmessage = (e) => {
  const { config, opts } = e.data;
  try {
    const rep = buildReport(config, { ...opts, onProgress: (stage) => self.postMessage({ type: 'progress', stage }) });
    self.postMessage({ type: 'done', text: formatReport(rep), json: rep });
  } catch (err) { self.postMessage({ type: 'error', message: String(err.stack || err) }); }
};
