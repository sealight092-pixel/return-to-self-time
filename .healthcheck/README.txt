公開サイトとアプリの点検（導入レビュー用）

このフォルダと.github/workflows/browser-health.ymlを既存リポジトリに追加する構成です。
アプリ本体は変更しません。現時点ではローカル保存のみ、実ブラウザ/CIは未実行です。

内容
・390×844、Asia/Tokyo、公式Chrome。test/再試行ごとに空のブラウザ環境を作ります。
・想月とSea Lightのトップ/問い合わせ：横はみ出し、表示、問い合わせ欄を確認。送信なし。
・無料：3回答を保存し、再読込後に履歴詳細から同じ内容を確認。
・有料：当日記録を保存し、再読込後に同じ内容を確認。
・有料音声：瞑想/ストーリー各1本を埋込再生UIで操作します。現在位置の同じDOM要素を固定し、
  実経過5秒以上・3回以上の段階的増加・増加が実経過＋2秒以内を同時に確認します。
  総時間への飛びは拒否し、プレーヤー維持と一時停止後3回の同じ時刻の確認も行います。
・Googleのログイン要求/CAPTCHA等は回避しません。検証不能なら失敗です。
・無料の下部余白が白くなる既知症状は実画面の画素とCSS/高さを照合してknown_issueに記録。
  この特定症状だけは失敗通知対象から除外し、その他の表示/保存/再生失敗は失敗にします。

出力
stdoutのHEALTHCHECK_RESULT=一行JSONとGitHub job summary。再試行の失敗も残します。
依存関係・Chrome準備・補助テストで中断した場合も、alwaysステップが未完了結果を残します。
token、認証情報、個人記録は出しません。artifact/trace/動画/画像のアップロードはありません。
画素確認に使うスクリーンショットはメモリ内だけで破棄します。

導入順
1. 固定Playwright 1.64.1でPRと手動の実行結果を確認します。
   PR検証中はdailyが未有効です。定期実行はdefault branch（main）への反映後に動きます。
2. lock未生成時は公式npmからnpm install --ignore-scriptsで取得し、
   HEALTHCHECK_PACKAGE_LOCK=として完全なlock JSONをstdoutへ出します。
3. そのJSONをpackage-lock.jsonとしてコミットすると、次から自動でnpm ciになります。
4. 最終CIを確認してmainへ反映後、GitHub補助テストは毎日23:45 UTC
   （日本時間翌日08:45）に実行します。PR検証用branchの段階では定期実行しません。
5. controllerのクラウド点検は毎日09:00 JST。08:45予定のGitHub補助テストの結果と
   最終実行日時も確認し、継続する失敗・未実行だけ通知します。
   初回失敗→1回の再試行で成功したflaky結果はJSONに残し、失敗通知は出しません。

実行上限はjob全体10分、テスト全体7分、各testの再試行は1回です。
公開repoの標準runner計算は無料。larger runnerとartifact/cache保存は使いません。
GitHub scheduleは遅延/欠落し得て、公開repoは60日活動がないと自動停止し得ます。
390pxのChrome模擬表示であり、実機の音の聞こえ方、Safari/PWA実機起動は保証しません。

ローカルにnpmがある場合：npm ci（初回lockなしはnpm install --ignore-scripts）
→ npx --no-install playwright install --with-deps chrome → npm run test:unit → npm test
この環境ではnpm未搭載のため依存取得/ブラウザ実行は行っていません。

公式資料
https://playwright.dev/docs/browser-contexts
https://playwright.dev/docs/emulation
https://playwright.dev/docs/browsers
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
https://docs.github.com/en/billing/concepts/product-billing/github-actions
