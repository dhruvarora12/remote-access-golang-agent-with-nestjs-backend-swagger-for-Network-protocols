#!/bin/bash
echo '{
  "serverUrl": "wss://42409defeb6f.ngrok-free.app",
  "agentId": "3af8a4ce-4694-47ee-bb18-e833b8daec3a"
}' | sudo tee /etc/remote-agent/config.json
