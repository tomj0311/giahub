@echo off
echo Starting FastAPI development server...

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    
    echo Installing requirements...
    venv\Scripts\pip install -r requirements.txt
)

echo Starting server on port 4000...
REM Use explicit reload dirs and delay to improve stability on Windows
REM Force watchfiles to use polling to avoid stdin glitches on Windows terminals
set UVICORN_RELOAD=true
set WATCHFILES_FORCE_POLLING=1
set PYTHONUNBUFFERED=1
set PYTHONLEGACYWINDOWSSTDIO=1

venv\Scripts\python -m uvicorn main:app ^
    --host 0.0.0.0 --port 4000 ^
    --reload --reload-impl statreload ^
    --reload-dir src --reload-dir . --reload-delay 0.5 ^
    --reload-exclude venv --reload-exclude __pycache__ --reload-exclude .git ^
    --log-level info --no-access-log
