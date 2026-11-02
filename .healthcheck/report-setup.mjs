import { existsSync, appendFileSync } from 'node:fs';

// テストreporterが動いた場合はそのJSONとsummaryが既にある。二重に出力しない。
if (!existsSync('healthcheck-result.json')) {
  const stages = ['DEPENDENCIES', 'CHROME', 'UNIT', 'BROWSER'].map(stage => ({
    stage: stage.toLowerCase(), outcome: process.env[`HEALTHCHECK_${stage}_OUTCOME`] || 'unknown',
  }));
  const report = { schemaVersion: 1, overallStatus: 'failed',
    observedAtJst: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }) + ' JST',
    reason: '準備または実行が中断され、ブラウザ点検を完了していません', stages, attempts: [] };
  process.stdout.write('HEALTHCHECK_RESULT=' + JSON.stringify(report) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '# ブラウザ点検は未完了です\n\n' + report.reason + '\n\n' +
      stages.map(item => `- ${item.stage}: ${item.outcome}`).join('\n') + '\n');
  }
  process.exitCode = 1;
}
