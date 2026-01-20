# Remote Access Agent

A powerful remote access and device management system that enables real-time control and monitoring of computers across networks. The system consists of a lightweight Go agent that runs on target machines and a NestJS backend server that provides a WebSocket-based communication protocol.

## Overview

This project provides comprehensive remote access capabilities including:

- **Real-time Command Execution** - Execute shell commands remotely via WebSocket
- **Network Scanning** - Discover and catalog all devices on the local network
- **File Operations** - Browse, upload, download, and delete files remotely
- **System Monitoring** - Collect detailed system information (CPU, memory, disk, network)
- **Cross-Platform Support** - Works on Windows, macOS, and Linux
- **Auto-Reconnection** - Persistent connection with automatic recovery
- **Host Management** - Track multiple hosts with unique identification

## Architecture

### Agent (Go)

The agent is a lightweight Go application that runs on target machines and maintains a persistent WebSocket connection to the server.

**Location**: `/cmd/agent/`

**Key Features**:
- WebSocket-based real-time communication
- System information collection
- Command execution engine
- Network scanning capabilities
- File operation handlers
- Auto-reconnection with exponential backoff

**Core Packages** (`/pkg/`):
- `connection` - WebSocket client management and reconnection logic
- `executor` - Shell command execution engine
- `fileops` - File system operations (list, read, write, delete)
- `netscanner` - Network device discovery and scanning
- `sysinfo` - System information collection (CPU, memory, disk, network)

### Backend Server (NestJS)

A Node.js/TypeScript backend built with NestJS framework that manages agents and provides REST/WebSocket APIs.

**Location**: `/server/`

**Technology Stack**:
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.IO (WebSocket)
- **API Documentation**: Swagger/OpenAPI

**Core Components**:
- `agent.gateway.ts` - WebSocket gateway handling agent connections
- `agent.controller.ts` - REST API endpoints for agent management
- `agent-download.controller.ts` - Agent binary distribution

## Communication Protocol

### WebSocket Events

The system uses Socket.IO for bidirectional real-time communication:

#### Agent → Server Events

| Event | Description | Payload |
|-------|-------------|---------|
| `register` | Agent registration with system info | `{ hostId, os, arch, platform, cpu, memory, disk, network }` |
| `command_result` | Command execution result | `{ commandId, success, output, error }` |
| `scan_started` | Network scan initiated | `{ commandId, message }` |

#### Server → Agent Events

| Event | Description | Payload |
|-------|-------------|---------|
| `execute_command` | Execute shell command | `{ commandId, command }` |
| `registered` | Registration confirmed | `{ hostId, message }` |

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/list` | GET | List all registered agents |
| `/agent/info/:hostId` | GET | Get agent system information |
| `/agent/history/:hostId` | GET | Get command execution history |
| `/agent/command` | POST | Send command to agent |
| `/agent/files/list` | POST | List files in directory |
| `/agent/files/download` | POST | Download file from agent |
| `/agent/files/upload` | POST | Upload file to agent |
| `/agent/files/delete` | POST | Delete file on agent |
| `/agent/network/scan` | POST | Trigger network scan |
| `/agent/network/scan/mock` | GET | Get mock network scan data |

## Agent Commands

The agent supports various command types:

### Special Commands

- `NETWORK_SCAN` - Scan local network for devices
- `FILE_LIST:<path>` - List files in directory
- `FILE_READ:<path>` - Read file contents
- `FILE_WRITE:<path>|<content>` - Write file (base64 content)
- `FILE_DELETE:<path>` - Delete file or folder

### Shell Commands

Any standard shell command can be executed:
```bash
# Examples
whoami
pwd
ls -la
ifconfig
ps aux
```

## Installation

### Agent Installation

#### macOS

**Quick Install** (from server):
```bash
curl -sSL https://YOUR_SERVER_URL/install-agent.sh | sudo bash
```

**Manual Install**:
```bash
# Download the agent binary
curl -L -o /usr/local/bin/remote-agent https://YOUR_SERVER_URL/download/agent-mac
chmod +x /usr/local/bin/remote-agent

# Run the agent
/usr/local/bin/remote-agent
```

**As System Service**:

The installer automatically creates a LaunchDaemon that:
- Starts on boot
- Restarts on crash
- Runs in background
- Logs to `/var/log/remote-agent/`

Configuration file: `/Library/LaunchDaemons/com.remoteagent.plist`

#### Windows

**Quick Install**:
```powershell
# Run PowerShell as Administrator
Invoke-WebRequest -Uri "https://YOUR_SERVER_URL/download/RemoteAgent-Windows.zip" -OutFile "RemoteAgent.zip"
Expand-Archive -Path "RemoteAgent.zip" -DestinationPath "C:\RemoteAgent"
cd C:\RemoteAgent
.\install-windows.ps1
```

**Manual Install**:
```batch
# Download and run
agent-windows.exe
```

The Windows installer creates a Windows Service that runs automatically.

#### Linux (Router/Embedded)

For OpenWrt, DD-WRT, and other router firmware:

```bash
# Download router agent
wget https://YOUR_SERVER_URL/download/agent-router.sh
chmod +x agent-router.sh

# Run the agent
./agent-router.sh
```

The router agent is a minimal shell script that works on resource-constrained devices.

### Server Setup

1. **Install Dependencies**:
```bash
cd server
pnpm install
```

2. **Configure Database**:
```bash
# Set up PostgreSQL connection in .env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

3. **Run Migrations**:
```bash
npx prisma migrate deploy
```

4. **Start Server**:
```bash
# Development
pnpm run start:dev

# Production
pnpm run start:prod
```

## Configuration

### Agent Configuration

The agent reads configuration from `/etc/remote-agent/config.json`:

```json
{
  "hostId": "unique-host-identifier",
  "serverUrl": "wss://your-server.com"
}
```

If no configuration exists, the agent generates a unique ID and connects to the default server URL.

### Server Configuration

Environment variables (`.env`):

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/db
PORT=3000
NODE_ENV=production
```

## Database Schema

The system uses PostgreSQL with the following key models:

### Host Model
- Stores device information (hostname, IP, MAC address)
- System specs (OS, CPU, memory, disk)
- Agent connection status and metadata
- Network information

### CommandHistory Model
- Command execution logs
- Output and error messages
- Execution timestamps
- Status tracking

## Building from Source

### Build Agent

```bash
# Build for current platform
go build -o agent-mac ./cmd/agent

# Cross-compile for Windows
GOOS=windows GOARCH=amd64 go build -o agent-windows.exe ./cmd/agent

# Build for Linux
GOOS=linux GOARCH=amd64 go build -o agent-linux ./cmd/agent
```

### Build Windows Installer

```bash
./build-windows-installer.sh
```

Creates a complete Windows package with:
- Agent executable
- Installation scripts (PowerShell & Batch)
- README with instructions

### Build macOS Package

```bash
./build-pkg.sh <host-id>
```

Creates a `.pkg` installer for macOS distribution.

### Build All Platforms

```bash
./build-all.sh
```

Builds agents for all supported platforms.

## Network Scanning

The agent can scan the local network to discover connected devices. The scanner detects:

- IP addresses
- MAC addresses
- Hostnames
- Vendor information (from MAC OUI lookup)
- Device types (router, computer, mobile, printer, camera, etc.)
- Open ports and running services
- Online status

Example scan result:
```json
{
  "localIP": "192.168.1.100",
  "network": "192.168.1.0/24",
  "gateway": "192.168.1.1",
  "totalDevices": 35,
  "devices": [
    {
      "ip": "192.168.1.1",
      "mac": "00:11:22:33:44:55",
      "hostname": "router",
      "vendor": "Cisco Systems",
      "deviceType": "Router/Firewall",
      "status": "online",
      "openPorts": [80, 443, 22],
      "services": ["Web Interface", "SSH"]
    }
  ]
}
```

## Router Support

The project includes a minimal shell script agent (`agent-router.sh`) specifically designed for routers and embedded devices:

- Compatible with OpenWrt, DD-WRT, Tomato, AsusWRT
- Minimal dependencies (only `sh` and `curl`/`wget`)
- Network scanning via ARP table, DHCP leases, WiFi clients
- Polling-based communication (fallback for environments without WebSocket)

## Downloads

The server automatically serves agent binaries via the download controller:

- `/download/agent-mac` - macOS agent
- `/download/agent-windows` - Windows executable  
- `/download/RemoteAgent-Windows.zip` - Windows package
- `/download/install-agent.sh` - macOS install script

The download endpoint accepts a `?hostId=` parameter to pre-configure the agent with a specific host identifier.


## Development

### Project Structure

```
remote-access-agent/
├── cmd/
│   └── agent/           # Agent entry point
│       ├── main.go      # Main application
│       └── config.go    # Configuration handling
├── pkg/
│   ├── connection/      # WebSocket client
│   ├── executor/        # Command execution
│   ├── fileops/         # File operations
│   ├── netscanner/      # Network scanning
│   └── sysinfo/         # System info collection
├── server/
│   ├── src/
│   │   ├── agent/       # Agent module
│   │   └── app.module.ts
│   └── prisma/
│       └── schema.prisma
├── build-all.sh         # Build script
├── install-agent.sh     # macOS installer
└── agent-router.sh      # Router agent
```

### Running in Development

**Agent**:
```bash
# Run with debug logs
AGENT_DEBUG=1 go run cmd/agent/main.go
```

**Server**:
```bash
cd server
pnpm run start:dev
```

## Troubleshooting

### Agent Not Connecting

1. Check server URL configuration
2. Verify network connectivity
3. Check firewall rules
4. Review logs: `/var/log/remote-agent/agent.log`

### Commands Timing Out

1. Increase timeout in server controller
2. Check agent process is running
3. Verify WebSocket connection is active

### Network Scan Not Working

1. Ensure agent has network access
2. Check firewall allows ICMP/ARP
3. For routers, verify tools available (`arp`, `ip`, etc.)

## Author

**Dhruv Arora**



## Support

For issues and questions, please [create an issue](https://github.com/your-repo/issues) on GitHub.
