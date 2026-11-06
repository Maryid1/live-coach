@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:5173/ after the server starts.
echo Keep this window open while using the app. Press Ctrl+C to stop.
call npm run dev -- --hostname 127.0.0.1
pause
