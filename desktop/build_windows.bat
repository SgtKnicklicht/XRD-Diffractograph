@echo off
REM ============================================================
REM   Diffractograph — Windows .exe build script
REM   Requires:  Python 3.10+, Node.js 18+, yarn, git
REM ============================================================
setlocal

cd /d "%~dp0"

echo.
echo === Creating Python virtual environment ===
if not exist .venv (
    py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat

echo.
echo === Installing build dependencies ===
python -m pip install --upgrade pip wheel
python -m pip install -r requirements.txt
if errorlevel 1 goto :err

echo.
echo === Running build ===
python build.py
if errorlevel 1 goto :err

echo.
echo ============================================================
echo   Done!   Output:  desktop\dist\Diffractograph\
echo   Run:    desktop\dist\Diffractograph\Diffractograph.exe
echo ============================================================
echo.
pause
exit /b 0

:err
echo.
echo *** Build failed.  See messages above.
pause
exit /b 1
