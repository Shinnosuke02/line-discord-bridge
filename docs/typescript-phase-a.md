# TypeScript導入 Phase A — 既存JavaScriptへの型チェック

更新: 2026-10-16

## 目的と採用しない変更

本フェーズでは**JavaScript実行と既存の本番環境をそのまま維持**し、型エラーの検出機構だけを導入する。

- `node src/app.js`、PM2 `ecosystem.config.js`、Node 24.x、既存 `npm start` / `npm restart` 処理は**無変更**
- `.env` の名前・内容、LINEのWebhook URL/署名、Discord Bot/Guild/channels、SQLite WALと既存マッピングを**無変更**
- LINE/Discord SDKやruntime dependenciesは**一切更新しない**
- `tsc` は `noEmit`: `dist` を作らず、`.ts` への書換えやproduction buildを行わない
- 本番Oracle VPSにTypeScriptの常駐プロセスや追加のサービスを入れない

## 導入内容

追加するもの:

1. `typescript@5.9.3`、`@types/node@24.19.0`（devDependenciesのみ・package-lockにピン留め）
2. `tsconfig.typecheck.json`: `strict: true`, `allowJs: true`, `checkJs: false`, `noEmit: true`
3. `npm run typecheck`: `tsc --project tsconfig.typecheck.json --noEmit`
4. 型チェック対象: `src/utils/async.js`、`src/utils/lineSource.js`、`src/utils/lineSticker.js`、`src/services/ReplyTokenPolicy.js`
5. GitHub Actions（Node 24.17.0 / 24.21.0）へ `Run JavaScript typecheck (Phase A)` ゲートを追加

`checkJs: false` でも、対象ファイルの `// @ts-check` で**実際に型チェックする**。TypeScript公式のopt-in方式。誤検知が少ない単機能コードから厳密に確認し、対象を今後増やす。

ただしPhase Aでは4ファイルしかチェックしておらず、**プロダクト全体の型安全性を保証するものではない**。既存LINE/Discord通信の動作確認はJest・API smoke・実機受入で別途実施する。

## 開発・CIでの実行

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run lint
```

`npm ci` はlocked dependencyのみ使用する。新しい型チェック実行は**CIに追加するだけ**であり、通常のPM2起動・再起動フローには追加しない。TypeScriptがdevDependencyであるため、CIなど型チェックを行う環境ではdev依存を含めてインストールする。VPSでproduction-only `npm ci --omit=dev` を行う場合でも、Nodeから起動する既存JavaScriptにTypeScriptのインストールは不要。

## 既存のデプロイ運用と今後

- 現在の現場運用 `git pull` → `npm restart` に**変更を要求しない**。
- リポジトリの現行 `package.json` に明示的な `restart` スクリプトはない。npmの標準lifecycleによる挙動とPM2実機状態の整合性については、**本番コマンドを勝手に変更せず、Phase B/Cの事前検証事項**とする。
- Phase B/Cで `.ts` を実際に導入すると、コンパイルがデプロイの必須工程になる。そのタイミングで独立release directory、検証後切替、停止回避、失敗時旧バージョン維持などを別途設計する。**Phase Aでは触れない。**
- `npm ci` は `node_modules` を作り直すので、本番実行時は従来どおりDBバックアップ・メンテナンス時間の確保・稼働確認を行う。

## 回帰検証・中止条件

- lockfileの変更がTypeScript/Node型定義のdev依存に限定されていること（runtime packageのバージョン変更なし）
- `npm ci`, production `npm audit --omit=dev --audit-level=high`, LINE/Discord/native smoke, Jest, ESLint, SQLite operations, `npm run typecheck` が全て成功すること
- GitHub Actionsの両Nodeバージョンで成功すること
- 動的動作の変更が**ゼロ**であることをPRの差分で確認（JSファイルは先頭の指示とJSDocコメントのみ）
- 失敗時は本番へ反映せずPR内で修正、またはPRを取り下げる
- Oracle VPSの実稼働状態はCIとは別検証。GitHub merge ≠ VPS deploy。

## 参考

TypeScript公式: https://www.typescriptlang.org/tsconfig/checkJs.html

本番互換性レビュー: [compatibility-review-2026-10-16.md](compatibility-review-2026-10-16.md)
