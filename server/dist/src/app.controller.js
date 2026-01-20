"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const fs = require("fs");
const path = require("path");
const fs_1 = require("fs");
const path_1 = require("path");
const swagger_1 = require("@nestjs/swagger");
const prisma_service_1 = require("../prisma/prisma.service");
let AppController = class AppController {
    appService;
    prisma;
    constructor(appService, prisma) {
        this.appService = appService;
        this.prisma = prisma;
    }
    getHello() {
        return this.appService.getHello();
    }
    getInstallAgentScript(res) {
        const filePath = path.join(__dirname, '../../install-agent.sh');
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/plain');
            res.sendFile(filePath);
        }
        else {
            res.status(404).send('Install script not found');
        }
    }
    async downloadAgentMac(res) {
        const agentPath = (0, path_1.join)(__dirname, '..', '..', 'agent-mac');
        try {
            if (!(0, fs_1.existsSync)(agentPath)) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent binary not found'
                });
            }
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment; filename="agent-mac"');
            res.setHeader('Accept-Ranges', 'none');
            res.setHeader('Cache-Control', 'no-cache');
            const fileStream = (0, fs_1.createReadStream)(agentPath);
            fileStream.pipe(res);
            fileStream.on('error', (error) => {
                console.error('Error streaming file:', error);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: 'Download failed' });
                }
            });
        }
        catch (error) {
            console.error('Download error:', error);
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        }
    }
    async quickInstall(res) {
        const googleDriveFileId = '1gwkoKG2oyi3IkvVLb1V9hExV9D0mtUW2';
        const script = `#!/bin/bash

echo "===================================="
echo "🚀 Remote Agent Quick Installer"
echo "===================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ This installer needs administrator privileges."
  echo ""
  echo "Please run with sudo:"
  echo "  sudo bash install-agent.command"
  echo ""
  echo "Or right-click the file → Open With → Terminal"
  echo "Then type your password when prompted."
  echo ""
  exit 1
fi

echo "📥 Downloading agent from Google Drive..."
curl -L "https://drive.google.com/uc?export=download&id=${googleDriveFileId}" -o /tmp/remote-agent

echo "✅ Download complete"

# Make executable
chmod +x /tmp/remote-agent

# Install to system
echo "📦 Installing agent..."
mkdir -p /usr/local/bin
mv /tmp/remote-agent /usr/local/bin/remote-agent

# Create LaunchDaemon
echo "⚙️  Creating system service..."
tee /Library/LaunchDaemons/com.remoteagent.plist > /dev/null << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.remoteagent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/remote-agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/remote-agent/agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/remote-agent/agent.error.log</string>
</dict>
</plist>
EOF

# Create log directory
mkdir -p /var/log/remote-agent

# Unload if already loaded
launchctl unload /Library/LaunchDaemons/com.remoteagent.plist 2>/dev/null || true

# Start service
echo "🚀 Starting agent..."
launchctl load -w /Library/LaunchDaemons/com.remoteagent.plist

echo ""
echo "✅ Installation complete!"
echo "Agent is now running in background!"
echo ""
echo "To view logs: tail -f /var/log/remote-agent/agent.log"
echo ""
echo "Press any key to close..."
read -n 1

exit 0
`;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename="install-agent.command"');
        res.send(script);
    }
    async verifyAgent(macAddress, res) {
        try {
            const host = await this.prisma.host.findFirst({
                where: { macAddress: macAddress },
                select: {
                    id: true,
                    hostName: true,
                    ipAddress: true,
                    macAddress: true,
                    agentInstalled: true,
                    agentConnected: true,
                    agentLastSeen: true,
                    agentVersion: true,
                    socketId: true,
                    systemInfo: true,
                    os: true,
                    arch: true,
                    platform: true,
                }
            });
            if (!host) {
                return res.status(404).json({
                    success: false,
                    status: 'not_found',
                    message: 'No host found with this MAC address',
                    macAddress: macAddress,
                });
            }
            const verification = {
                hostId: host.id,
                hostName: host.hostName,
                ipAddress: host.ipAddress,
                macAddress: host.macAddress,
                agentInstalled: host.agentInstalled,
                agentConnected: host.agentConnected,
                agentLastSeen: host.agentLastSeen,
                agentVersion: host.agentVersion,
                os: host.os,
                arch: host.arch,
                platform: host.platform,
                systemInfo: host.systemInfo,
            };
            let status;
            if (host.agentInstalled && host.agentConnected) {
                status = 'fully_operational';
            }
            else if (host.agentInstalled && !host.agentConnected) {
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                if (host.agentLastSeen && host.agentLastSeen > fiveMinutesAgo) {
                    status = 'recently_disconnected';
                }
                else {
                    status = 'installed_not_running';
                }
            }
            else {
                status = 'not_installed';
            }
            return res.json({
                success: true,
                status,
                ...verification,
            });
        }
        catch (error) {
            console.error('Verification error:', error);
            return res.status(500).json({
                success: false,
                message: 'Verification failed',
                error: error.message
            });
        }
    }
    async downloadInstaller(req, res) {
        console.log('📍 __dirname:', __dirname);
        const pkgPath = (0, path_1.join)(__dirname, '..', '..', 'installers', 'RemoteAgent.pkg');
        console.log('📍 pkgPath:', pkgPath);
        console.log('📍 File exists?', (0, fs_1.existsSync)(pkgPath));
        try {
            if (!(0, fs_1.existsSync)(pkgPath)) {
                console.log('❌ File not found at:', pkgPath);
                return res.status(404).json({
                    success: false,
                    message: 'Installer not found'
                });
            }
            console.log('✅ File found, creating download log...');
            const stats = fs.statSync(pkgPath);
            console.log('📦 File size:', stats.size);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment; filename="RemoteAgent.pkg"');
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Accept-Ranges', 'none');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('ngrok-skip-browser-warning', 'true');
            console.log('📤 Starting file stream...');
            const fileStream = (0, fs_1.createReadStream)(pkgPath);
            fileStream.pipe(res);
            fileStream.on('error', (error) => {
                console.error('❌ Error streaming file:', error);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: 'Download failed' });
                }
            });
        }
        catch (error) {
            console.error('❌ Download error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Get)('install-agent.sh'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getInstallAgentScript", null);
__decorate([
    (0, common_1.Get)('download/agent-mac'),
    (0, swagger_1.ApiOperation)({ summary: 'Download macOS agent' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "downloadAgentMac", null);
__decorate([
    (0, common_1.Get)('quick-install'),
    (0, swagger_1.ApiOperation)({ summary: 'Download self-executing installer' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "quickInstall", null);
__decorate([
    (0, common_1.Get)('verify-agent/:macAddress'),
    (0, swagger_1.ApiOperation)({ summary: 'Verify if agent is installed and running by MAC address' }),
    __param(0, (0, common_1.Param)('macAddress')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "verifyAgent", null);
__decorate([
    (0, common_1.Get)('download-installer'),
    (0, swagger_1.ApiOperation)({ summary: 'Download macOS installer package' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "downloadInstaller", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService,
        prisma_service_1.PrismaService])
], AppController);
//# sourceMappingURL=app.controller.js.map