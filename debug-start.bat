@echo off
echo Discord=>LINE デバッグ用アプリケーション起動
echo ================================================

REM 環境変数を設定
set NODE_ENV=development
set LOG_LEVEL=debug

REM ログディレクトリを作成
if not exist "logs" mkdir logs

echo 環境変数設定:
echo NODE_ENV=%NODE_ENV%
echo LOG_LEVEL=%LOG_LEVEL%
echo.

echo アプリケーションを起動中...
node src/app.js

pause
