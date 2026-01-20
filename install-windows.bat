@echo off
REM Remote Agent Windows Installer
REM Run as Administrator

echo ========================================
echo Remote Agent Windows Installer
echo ========================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

REM Configuration
set INSTALL_DIR=C:\Program Files\RemoteAgent
set CONFIG_DIR=C:\ProgramData\RemoteAgent
set SERVER_URL=wss://42409defeb6f.ngrok-free.app

echo Installing Remote Agent...
echo Install Directory: %INSTALL_DIR%
echo Config Directory: %CONFIG_DIR%
echo.

REM Create directories
echo Creating directories...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

REM Copy agent binary
echo Copying agent binary...
if exist "agent-windows.exe" (
    copy /Y "agent-windows.exe" "%INSTALL_DIR%\remote-agent.exe"
) else (
    echo ERROR: agent-windows.exe not found!
    pause
    exit /b 1
)

REM Create config file
echo Creating configuration...
(
echo {
echo   "serverUrl": "%SERVER_URL%",
echo   "agentId": ""
echo }
) > "%CONFIG_DIR%\config.json"

REM Add to PATH (optional)
echo Adding to system PATH...
setx /M PATH "%INSTALL_DIR%;%PATH%" >nul 2>&1

REM Create a Windows Service using sc.exe
echo Creating Windows Service...
sc create RemoteAgent binPath= "%INSTALL_DIR%\remote-agent.exe" start= auto DisplayName= "Remote Agent Service"

if %errorLevel% equ 0 (
    echo Starting service...
    sc start RemoteAgent
    echo.
    echo Service created and started successfully!
) else (
    echo.
    echo Note: Service creation failed. You may need to install manually.
    echo To run as service later, use: sc create RemoteAgent binPath= "%INSTALL_DIR%\remote-agent.exe" start= auto
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Agent installed to: %INSTALL_DIR%\remote-agent.exe
echo Config file: %CONFIG_DIR%\config.json
echo.
echo The agent is now running as a Windows Service!
echo It will auto-start on system boot.
echo.
echo To manage the service:
echo   Start:   sc start RemoteAgent
echo   Stop:    sc stop RemoteAgent
echo   Status:  sc query RemoteAgent
echo   Remove:  sc delete RemoteAgent
echo.
echo To run manually instead:
echo   1. Open Command Prompt or PowerShell
echo   2. Run: cd "%INSTALL_DIR%"
echo   3. Run: remote-agent.exe
echo.
echo Server URL: %SERVER_URL%
echo.
pause
