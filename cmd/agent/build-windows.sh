#!/bin/bash

# Usage: ./build-windows.sh <hostId>

if [ -z "$1" ]; then
    echo "❌ Error: hostId is required"
    echo "Usage: ./build-windows.sh <hostId>"
    exit 1
fi

HOST_ID="$1"
echo "🔨 Building Windows installer with hostId: $HOST_ID"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Create config directory
mkdir -p config

# Create config.json with hostId and serverUrl
cat > config/config.json <<EOF
{
  "serverUrl": "ws://localhost:3000",
  "hostId": "$HOST_ID"
}
EOF

echo "✅ Created config.json with hostId: $HOST_ID"

# Build the Go agent for Windows
echo "🔨 Building Windows agent binary..."
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o "RemoteAgent-${HOST_ID}.exe" .

if [ $? -eq 0 ]; then
    echo "✅ Windows agent built successfully: RemoteAgent-${HOST_ID}.exe"
    
    # Clean up config file
    rm -rf config
    
    # Get file size
    EXE_SIZE=$(du -h "RemoteAgent-${HOST_ID}.exe" | cut -f1)
    echo "📦 Executable size: $EXE_SIZE"
    
    exit 0
else
    echo "❌ Build failed"
    rm -rf config
    exit 1
fi