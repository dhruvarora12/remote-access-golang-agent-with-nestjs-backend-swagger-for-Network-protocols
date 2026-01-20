#!/bin/bash

# Usage: ./build-pkg.sh <hostId>

if [ -z "$1" ]; then
    echo "❌ Error: hostId is required"
    echo "Usage: ./build-pkg.sh <hostId>"
    exit 1
fi

HOST_ID="$1"
echo "🔨 Building macOS PKG installer with hostId: $HOST_ID"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Clean up any previous builds
rm -rf pkg-build
rm -f RemoteAgent-*.pkg

# Create package structure
echo "📦 Creating package structure..."
mkdir -p pkg-build/payload/usr/local/bin
mkdir -p pkg-build/payload/etc/remote-agent
mkdir -p pkg-build/scripts

# Build the Go agent
echo "🔨 Building Go agent binary..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o pkg-build/payload/usr/local/bin/remote-agent .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    rm -rf pkg-build
    exit 1
fi

echo "✅ Agent binary built"

# Make binary executable
chmod +x pkg-build/payload/usr/local/bin/remote-agent

# Create config.json
cat > pkg-build/payload/etc/remote-agent/config.json <<EOF
{
  "serverUrl": "ws://localhost:3000",
  "hostId": "$HOST_ID"
}
EOF

echo "✅ Created config.json with hostId: $HOST_ID"

# Create postinstall script
cat > pkg-build/scripts/postinstall << 'POSTINSTALL_EOF'
#!/bin/bash

echo "🚀 Installing Remote Agent service..."

# Create LaunchDaemon plist
cat > /Library/LaunchDaemons/com.remote-agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.remote-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/remote-agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/remote-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/remote-agent.error.log</string>
</dict>
</plist>
EOF

# Set permissions
chmod 644 /Library/LaunchDaemons/com.remote-agent.plist
chown root:wheel /Library/LaunchDaemons/com.remote-agent.plist

# Load and start the service
launchctl load /Library/LaunchDaemons/com.remote-agent.plist

echo "✅ Remote Agent service installed and started"

exit 0
POSTINSTALL_EOF

# Make postinstall executable
chmod +x pkg-build/scripts/postinstall

echo "✅ Created postinstall script"

# Build the package
echo "📦 Building PKG installer..."

PKG_NAME="RemoteAgent-$HOST_ID.pkg"

pkgbuild --root pkg-build/payload \
         --scripts pkg-build/scripts \
         --identifier com.remote-agent \
         --version 1.0 \
         --install-location / \
         "$PKG_NAME"

if [ $? -eq 0 ]; then
    echo "✅ PKG installer created: $PKG_NAME"
    
    # Get file size
    PKG_SIZE=$(du -h "$PKG_NAME" | cut -f1)
    echo "📦 Package size: $PKG_SIZE"
    
    # Clean up build directory
    rm -rf pkg-build
    
    exit 0
else
    echo "❌ PKG build failed"
    rm -rf pkg-build
    exit 1
fi