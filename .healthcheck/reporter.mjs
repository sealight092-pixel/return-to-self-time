import { appendFileSync } from 'node:fs';

const clean = text => String(text ?? '')
  .replace(/(?:Bearer\s+|gh[opsu]_|github_pat_)[A-Za-z0-9_\-.]+/gi, '[REDACTED]')
  .replace(/https?:\/\/[^\s)>]+/g, url => url.split(/[?#]/)[0])
  .replace(/\u001b\[[0-9;]*m/g, '')
  .slice(0, 700);
const cell = text => clean(text).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

export default class HealthReporter {
  attempts = [];

  onTestEnd(test, result) {
    const checks = result.attachments
      .filter(item => item.name === 'health-check' && item.body)
      .flatMap(item => {
        try { return [JSON.parse(item.body.toString('utf8'))]; } catch { return []; }
      });
    this.attempts.push({
      name: test.titlePath().filter(Boolean).join(' / '),
      attempt: result.retry + 1,
      status: result.status,
      durationMs: result.duration,
      checks,
      errors: result.errors.map(error => clean(error.message)),
    });
  }

  onError(error) {
    this.attempts.push({ name: '実行環境', status: 'failed', errors: [clean(error.message)], checks: [] });
  }

  onEnd(result) {
    const report = {
      schemaVersion: 1,
      observedAtJst: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }) + ' JST',
      overallStatus: result.status,
      attempts: this.attempts,
    };
    process.stdout.write('HEALTHCHECK_RESULT=' + JSON.stringify(report) + '\n');
    if (!process.env.GITHUB_STEP_SUMMARY) return;
    const lines = [
      '# 公開サイトとアプリの点検',
      '',
      `${report.observedAtJst} / ${cell(result.status)}`,
      '',
      '390×844、空のブラウザ環境、Asia/Tokyo。既存の個人記録・認証情報は使用していません。',
      '',
      '| 項目 | 試行 | 結果 | 内容 |',
      '|---|---:|---|---|',
    ];
    for (const attempt of this.attempts) {
      lines.push(`| ${cell(attempt.name)} | ${attempt.attempt ?? '-'} | ${cell(attempt.status)} | ${cell(attempt.errors.join(' '))} |`);
      for (const check of attempt.checks) {
        lines.push(`| ${cell(check.check)} | | ${cell(check.status)} | ${cell(JSON.stringify(check.details ?? {}))} |`);
      }
    }
    lines.push('', 'known_issueは確認済みの無料アプリ下部背景だけです。他の失敗・検証不能は失敗として扱います。');
    lines.push('1回目失敗・2回目成功も両方記録します。GitHubの最終成功だけで一時障害を消しません。');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}
