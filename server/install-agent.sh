#!/bin/bash

# Remote Agent Installer - Requires sudo
set -e

echo "===================================="
echo "🚀 Remote Agent Installer"
echo "===================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run with sudo:"
  echo "   curl -sSL https://dd2728dda8ed.ngrok-free.app/install-agent.sh | sudo bash"
  exit 1
fi

# Configuration
INSTALL_DIR="/usr/local/bin"
AGENT_NAME="remote-agent"
AGENT_URL="https://dd2728dda8ed.ngrok-free.app/download/agent-mac"
PLIST_PATH="/Library/LaunchDaemons/com.remoteagent.plist"
LOG_DIR="/var/log/remote-agent"

echo "📁 Creating installation directory..."
mkdir -p "$INSTALL_DIR"

echo "📥 Downloading agent..."
# Add retry logic and better error handling
for i in {1..3}; do
  if curl -f -L --retry 3 --retry-delay 2 -o "$INSTALL_DIR/$AGENT_NAME" "$AGENT_URL"; then
    echo "✅ Download successful"
    break
  else
    echo "⚠️  Download attempt $i failed"
    if [ $i -eq 3 ]; then
      echo "❌ Download failed after 3 attempts"
      exit 1
    fi
    sleep 2
  fi
done

chmod +x "$INSTALL_DIR/$AGENT_NAME"

echo "📁 Creating log directory..."
mkdir -p "$LOG_DIR"

echo "⚙️  Creating system service..."
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.remoteagent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/$AGENT_NAME</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent.error.log</string>
</dict>
</plist>
EOF

# Unload if already loaded
launchctl unload "$PLIST_PATH" 2>/dev/null || true

echo "🚀 Starting service..."
launchctl load -w "$PLIST_PATH"

# Wait and verify
sleep 2
if launchctl list | grep -q "com.remoteagent"; then
  echo ""
  echo "✅ Installation complete!"
  echo ""
  echo "Agent is now running in background and will start on every boot."
  echo ""
  echo "Logs: $LOG_DIR/agent.log"
  echo ""
  echo "To view logs: sudo tail -f $LOG_DIR/agent.log"
  echo ""
  echo "To uninstall:"
  echo "  sudo launchctl unload -w $PLIST_PATH"
  echo "  sudo rm $PLIST_PATH"
  echo "  sudo rm $INSTALL_DIR/$AGENT_NAME"
  echo ""
else
  echo "⚠️  Service loaded but status unclear. Check logs:"
  echo "  sudo tail $LOG_DIR/agent.log"
fi