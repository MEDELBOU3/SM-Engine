@echo off
setlocal

REM ============================================================
REM SM Engine Native Water - Windows CMake build helper
REM
REM Set these two paths to headers/libs that MATCH the Node/Electron
REM runtime used by your SM Engine.
REM ============================================================

if "%NODE_INCLUDE_DIR%"=="" (
    echo [ERROR] NODE_INCLUDE_DIR is not set.
    echo Example:
    echo   set NODE_INCLUDE_DIR=C:\path\to\electron-headers\node_headers\include\node
    exit /b 1
)

if "%NODE_LIB%"=="" (
    echo [ERROR] NODE_LIB is not set.
    echo Example:
    echo   set NODE_LIB=C:\path\to\node.lib
    exit /b 1
)

cmake -S "%~dp0" -B "%~dp0build" ^
  -DNODE_INCLUDE_DIR="%NODE_INCLUDE_DIR%" ^
  -DNODE_LIB="%NODE_LIB%"

if errorlevel 1 exit /b %errorlevel%

cmake --build "%~dp0build" --config Release

if errorlevel 1 exit /b %errorlevel%

echo.
echo [SM Native Water] Build complete:
echo %~dp0build\Release\sm_water_native.node
endlocal
