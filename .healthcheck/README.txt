公開サイトとアプリの毎日点検

このフォルダと.github/workflows/browser-health.ymlが公開4サービスを点検します。
アプリ本体のファイル、利用者の記録や認証情報は変更しません。

無料アプリの背景修正
下部白背景のCSS修正は無料アプリのPR #1で本番公開済みです。
https://github.com/sogetsucounseling-droid/emotion-app/pull/1
Pages公開処理も成功しています。
https://github.com/sogetsucounseling-droid/emotion-app/actions/runs/41431613346
2026-11-02 19:53 JSTのライブCIで、公開版の390px/320px表示と保存・再読込を確認しました。
全9項目が再試行なしに通過しました。
https://github.com/sealight092-pixel/return-to-self-time/actions/runs/41432133388
以後、下部白背景の再発を通常のCI失敗・通知対象にします。

毎日の実行
・GitHubの補助テスト：毎日08:45 JST（23:45 UTC）。
・専用クラウドチャット：毎日09:00 JSTに、当日の実行結果と公開ページを確認。
・新しい不具合、既存不具合の悪化、点検の停止だけを通知。正常時の定例通知はしません。
・PRの点検ファイル変更時と手動実行にも対応。PR内のscheduleはmain反映後に有効です。

内容
・無料アプリは390×844・320×740。他のサイトと有料アプリは390×844。
  Asia/Tokyo、公式Chrome。test/再試行ごとに空のブラウザ環境を作ります。
・想月とSea Lightのトップと問い合わせ：横はみ出し、表示、問い合わせ専用欄を確認。送信なし。
・無料：両サイズでQ3外側・保存欄・最下部の暗色RGBと横はみ出しを確認。
  3回答をUIから保存し、再読込後に履歴詳細から同じ内容を確認。
・有料：当日記録を保存し、再読込後に同じ内容を確認。
・有料音声：瞑想とストーリー各1本をアプリ内の埋込再生UIで操作。
  同じ現在位置の要素を監視し、5秒以上の実経過、3回以上の段階的増加、
  実経過＋2秒を超えないこと、再生画面の維持、一時停止後の時刻停止を確認します。
・Googleの認証要求、CAPTCHA、アクセス制限は回避せず、検証不能は失敗として記録。
・無料アプリの下部余白は、画素を測定して濃色背景の維持を必須にします。
  白背景が再発した場合も、ほかの表示・保存・再生の失敗と同様にCIを失敗にして通知します。

出力と費用
stdoutのHEALTHCHECK_RESULT=一行JSONとGitHub job summary。
準備段階の中断も結果に残します。再試行で成功した場合も初回失敗を記録します。
token、認証情報、個人記録を出さず、artifact、trace、動画、画像、キャッシュをアップロードしません。
画素確認に使うスクリーンショットはメモリ内だけで破棄します。
公開repoの標準runner計算は無料。larger runnerは使いません。

導入時の検証
2026-11-02の最終CIで、8項目が再試行なしに通過しました。
https://github.com/sealight092-pixel/return-to-self-time/actions/runs/41410156443
瞑想・ストーリーは現在位置0→5秒、約9秒の観測、5回の増加、一時停止を確認。
上記の導入時CIでは、修正前の無料アプリ下部白背景をknown_issueとして記録しました。
無料アプリの修正公開に伴い、この例外を削除しました。現在は暗色背景を必須にして再発も失敗にします。
Playwright 1.64.1とpackage-lock.jsonで依存関係を固定しています。

実行方法と停止
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install --with-deps chrome
npm run test:unit
npm test
GitHub Actionsの当該ワークフローをDisable workflowで停止できます。
job全体10分、テスト全体7分、各testの再試行は1回までです。
GitHub scheduleは遅延や欠落があり、公開repoは60日活動がないと自動停止する場合があります。
クラウド点検で最終実行日時も確認し、停止や未完了を正常扱いにしません。
390px/320pxはスマホ相当のChrome表示で、Safariや実機PWA起動、端末スピーカーの品質確認は含みません。

公式資料
https://playwright.dev/docs/browser-contexts
https://playwright.dev/docs/emulation
https://playwright.dev/docs/browsers
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
https://docs.github.com/en/billing/concepts/product-billing/github-actions
