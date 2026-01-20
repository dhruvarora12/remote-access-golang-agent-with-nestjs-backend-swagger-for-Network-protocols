#!/bin/bash
set -e

HOST_ID=$1

if [ -z "$HOST_ID" ]; then
  echo "Usage: ./build-pkg.sh <hostId>"
  exit 1
fi

echo "Building PKG with hostId: $HOST_ID"

# Build the Go agent
cd cmd/agent
go build -o ../../installer/payload/usr/local/bin/remote-agent main.go config.go
cd ../..

# Create config directory in payload
mkdir -p installer/payload/etc/remote-agent

# Create config.json with hostId
cat > installer/payload/etc/remote-agent/config.json << EOF
{
  "serverUrl": "wss://42409defeb6f.ngrok-free.app",
  "hostId": "$HOST_ID"
}
EOF

# Build the PKG
pkgbuild --root installer/payload \
         --scripts installer/scripts \
         --identifier com.remoteagent \
         --version 1.0 \
         --install-location / \
         RemoteAgent-$HOST_ID.pkg

echo "✅ PKG created: RemoteAgent-$HOST_ID.pkg"