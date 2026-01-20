#!/bin/bash
set -e

echo "=== Building Windows Agent Installer Package ==="
echo ""

# Build Windows binary
echo "Building Windows agent binary..."
GOOS=windows GOARCH=amd64 go build -o agent-windows.exe ./cmd/agent

# Create distribution folder
DIST_DIR="RemoteAgent-Windows"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy files
echo "Copying files to distribution folder..."
cp agent-windows.exe "$DIST_DIR/"
cp install-windows.bat "$DIST_DIR/"
cp install-windows.ps1 "$DIST_DIR/"

# Create README
cat > "$DIST_DIR/README.txt" << 'EOF'
Remote Agent - Windows Installer
=================================

INSTALLATION INSTRUCTIONS:

Method 1: Using Batch File (Easiest)
-------------------------------------
1. Right-click "install-windows.bat"
2. Select "Run as administrator"
3. Follow the on-screen instructions

Method 2: Using PowerShell
---------------------------
1. Right-click PowerShell
2. Select "Run as administrator"
3. Run: .\install-windows.ps1

Method 3: Manual Installation
------------------------------
1. Copy agent-windows.exe to C:\Program Files\RemoteAgent\
2. Create config.json in C:\ProgramData\RemoteAgent\
3. Run the agent: agent-windows.exe

RUNNING THE AGENT:
------------------
After installation:
1. Open Command Prompt or PowerShell
2. Run: cd "C:\Program Files\RemoteAgent"
3. Run: .\remote-agent.exe

The agent will connect to the server automatically.

UNINSTALLATION:
---------------
1. Stop the agent if running
2. Delete C:\Program Files\RemoteAgent\
3. Delete C:\ProgramData\RemoteAgent\

For support, contact your system administrator.
EOF

# Create ZIP package
ZIP_NAME="RemoteAgent-Windows.zip"
echo "Creating ZIP package: $ZIP_NAME"
rm -f "$ZIP_NAME"

if command -v zip &> /dev/null; then
    cd "$DIST_DIR"
    zip -r "../$ZIP_NAME" . > /dev/null
    cd ..
    echo "✅ ZIP package created: $ZIP_NAME"
else
    echo "⚠️  'zip' command not found. Creating tar.gz instead..."
    tar -czf "RemoteAgent-Windows.tar.gz" "$DIST_DIR"
    echo "✅ Package created: RemoteAgent-Windows.tar.gz"
fi

# Summary
echo ""
echo "==================================="
echo "Windows Installer Package Created!"
echo "==================================="
echo ""
echo "📦 Package: $ZIP_NAME"
echo "📁 Contents:"
ls -lh "$DIST_DIR"
echo ""
echo "Send this package to Windows users!"
echo ""
