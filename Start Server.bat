@echo off
echo ============================================
echo   MOVIE FINDER - Starting Local Server
echo ============================================
echo.

REM Try Node.js server first (required for environment variables and API security)
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting Express server with Node.js...
    echo.
    echo Open your browser and go to:
    echo   http://localhost:8080
    echo.
    echo Press Ctrl+C to stop the server.
    echo.
    npm start
    goto :done
)

REM Try Python 3
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting server with Python...
    echo.
    echo Open your browser and go to:
    echo   http://localhost:8080
    echo.
    echo Press Ctrl+C to stop the server.
    echo.
    python -m http.server 8080
    goto :done
)

REM Try Python as py
py --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting server with Python...
    echo.
    echo Open your browser and go to:
    echo   http://localhost:8080
    echo.
    py -m http.server 8080
    goto :done
)

REM Try Node.js npx serve
npx --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting server with Node.js...
    echo.
    echo Open your browser and go to:
    echo   http://localhost:8080
    echo.
    npx serve -p 8080 .
    goto :done
)

echo ERROR: Neither Python nor Node.js found.
echo.
echo Please install Python from https://python.org
echo Or install Node.js from https://nodejs.org
echo.
pause

:done
