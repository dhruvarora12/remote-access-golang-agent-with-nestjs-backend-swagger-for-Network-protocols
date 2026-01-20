#!/bin/bash

echo "Building agent for all platforms..."

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o agent-mac-intel ./cmd/agent
echo "✅ Built: agent-mac-intel"

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o agent-mac-arm ./cmd/agent
echo "✅ Built: agent-mac-arm"

# Windows
GOOS=windows GOARCH=amd64 go build -o agent-windows.exe ./cmd/agent
echo "✅ Built: agent-windows.exe"

# Linux
GOOS=linux GOARCH=amd64 go build -o agent-linux ./cmd/agent
echo "✅ Built: agent-linux"

echo ""
echo "🎉 All builds complete!"
ls -lh agent-*
