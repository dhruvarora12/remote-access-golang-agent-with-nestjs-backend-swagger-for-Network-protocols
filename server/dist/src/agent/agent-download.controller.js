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
exports.AgentDownloadController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const fs = require("fs");
const path = require("path");
let AgentDownloadController = class AgentDownloadController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async downloadMacOS(res) {
        try {
            console.log('📥 macOS download request received');
            const uniqueId = Date.now();
            const placeholderIP = `0.0.0.${uniqueId % 256}`;
            let host;
            const existingHost = await this.prisma.host.findFirst({
                where: { ipAddress: placeholderIP },
            });
            if (existingHost) {
                host = existingHost;
                console.log(`✅ Reusing existing placeholder host: ${host.id}`);
            }
            else {
                host = await this.prisma.host.create({
                    data: {
                        hostName: `pending-${uniqueId}`,
                        ipAddress: placeholderIP,
                        macAddress: `00:00:00:00:00:${(uniqueId % 256).toString(16).padStart(2, '0')}`,
                        platform: 'macOS',
                        os: 'darwin',
                        arch: 'Unknown',
                        latitude: '0',
                        longitude: '0',
                        status: 'DOWN',
                        agentInstalled: false,
                        agentConnected: false,
                    },
                });
                console.log(`✅ Created placeholder host with ID: ${host.id}`);
            }
            const agentDir = path.resolve(__dirname, '../../../../cmd/agent');
            const buildScript = path.join(agentDir, 'build-pkg.sh');
            console.log(`🔍 Looking for PKG build script at: ${buildScript}`);
            if (!fs.existsSync(buildScript)) {
                console.error('❌ PKG build script not found:', buildScript);
                return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: `PKG build script not found at: ${buildScript}`,
                });
            }
            const { execSync } = require('child_process');
            try {
                console.log(`🔨 Building PKG installer with hostId: ${host.id}`);
                execSync(`cd "${agentDir}" && ./build-pkg.sh ${host.id}`, {
                    stdio: 'inherit',
                });
            }
            catch (buildError) {
                console.error('❌ PKG build failed:', buildError);
                return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'PKG build failed',
                    error: buildError.message,
                });
            }
            const pkgPath = path.join(agentDir, `RemoteAgent-${host.id}.pkg`);
            if (!fs.existsSync(pkgPath)) {
                console.error('❌ PKG installer not found:', pkgPath);
                return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'PKG installer not found',
                });
            }
            console.log(`📤 Sending PKG installer for host: ${host.id}`);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="RemoteAgent.pkg"`);
            const fileStream = fs.createReadStream(pkgPath);
            fileStream.pipe(res);
            fileStream.on('end', () => {
                setTimeout(() => {
                    try {
                        fs.unlinkSync(pkgPath);
                        console.log(`🧹 Cleaned up temporary PKG file: ${pkgPath}`);
                    }
                    catch (err) {
                        console.error('⚠️ Failed to clean up PKG file:', err);
                    }
                }, 1000);
            });
            fileStream.on('error', (err) => {
                console.error('❌ Error streaming PKG file:', err);
            });
        }
        catch (error) {
            console.error('❌ macOS download error:', error);
            return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message || 'Download failed',
            });
        }
    }
    async downloadWindows(res) {
        try {
            console.log('📥 Windows download request received');
            const uniqueId = Date.now();
            const placeholderIP = `0.0.0.${uniqueId % 256}`;
            let host;
            const existingHost = await this.prisma.host.findFirst({
                where: { ipAddress: placeholderIP },
            });
            if (existingHost) {
                host = existingHost;
                console.log(`✅ Reusing existing placeholder host: ${host.id}`);
            }
            else {
                host = await this.prisma.host.create({
                    data: {
                        hostName: `pending-${uniqueId}`,
                        ipAddress: placeholderIP,
                        macAddress: `00:00:00:00:00:${(uniqueId % 256).toString(16).padStart(2, '0')}`,
                        platform: 'Windows',
                        os: 'windows',
                        arch: 'Unknown',
                        latitude: '0',
                        longitude: '0',
                        status: 'DOWN',
                        agentInstalled: false,
                        agentConnected: false,
                    },
                });
                console.log(`✅ Created placeholder host with ID: ${host.id}`);
            }
            const agentDir = path.resolve(__dirname, '../../../../cmd/agent');
            const buildScript = path.join(agentDir, 'build-windows.sh');
            console.log(`🔍 Looking for Windows build script at: ${buildScript}`);
            if (!fs.existsSync(buildScript)) {
                console.error('❌ Windows build script not found:', buildScript);
                return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: `Windows build script not found at: ${buildScript}`,
                });
            }
            const { execSync } = require('child_process');
            try {
                console.log(`🔨 Building Windows executable with hostId: ${host.id}`);
                execSync(`cd "${agentDir}" && ./build-windows.sh ${host.id}`, {
                    stdio: 'inherit',
                });
            }
            catch (buildError) {
                console.error('❌ Windows build failed:', buildError);
                return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Windows build failed',
                    error: buildError.message,
                });
            }
            const exePath = path.join(agentDir, `RemoteAgent-${host.id}.exe`);
            if (!fs.existsSync(exePath)) {
                console.error('❌ Windows executable not found:', exePath);
                return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Windows executable not found',
                });
            }
            console.log(`📤 Sending Windows executable for host: ${host.id}`);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="RemoteAgent.exe"`);
            const fileStream = fs.createReadStream(exePath);
            fileStream.pipe(res);
            fileStream.on('end', () => {
                setTimeout(() => {
                    try {
                        fs.unlinkSync(exePath);
                        console.log(`🧹 Cleaned up temporary exe file: ${exePath}`);
                    }
                    catch (err) {
                        console.error('⚠️ Failed to clean up exe file:', err);
                    }
                }, 1000);
            });
            fileStream.on('error', (err) => {
                console.error('❌ Error streaming exe file:', err);
            });
        }
        catch (error) {
            console.error('❌ Windows download error:', error);
            return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message || 'Download failed',
            });
        }
    }
    async uninstallAgent(hostId, res) {
        try {
            console.log(`🗑️ Uninstall request for host: ${hostId}`);
            const host = await this.prisma.host.findUnique({
                where: { id: hostId },
            });
            if (!host) {
                return res.status(common_1.HttpStatus.NOT_FOUND).json({
                    success: false,
                    message: 'Host not found',
                });
            }
            await this.prisma.host.update({
                where: { id: hostId },
                data: {
                    agentInstalled: false,
                    agentConnected: false,
                    agentLastSeen: new Date(),
                    status: 'DOWN',
                },
            });
            const deletedCommands = await this.prisma.commandHistory.deleteMany({
                where: { hostId: hostId },
            });
            console.log(`✅ Agent uninstalled for host: ${hostId}`);
            return res.status(common_1.HttpStatus.OK).json({
                success: true,
                message: 'Agent uninstalled successfully',
                data: {
                    hostId: hostId,
                    hostName: host.hostName,
                    deletedCommands: deletedCommands.count,
                },
            });
        }
        catch (error) {
            console.error('❌ Uninstall error:', error);
            return res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message || 'Uninstall failed',
            });
        }
    }
    async getUninstallScript(res) {
        const uninstallScript = `#!/bin/bash

echo "🗑️  Remote Agent Uninstaller"
echo "=============================="
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Please run as root (use sudo)"
    exit 1
fi

echo "🔍 Stopping agent..."

# Stop and unload LaunchDaemon (macOS)
if [ -f "/Library/LaunchDaemons/com.remote-agent.plist" ]; then
    launchctl unload /Library/LaunchDaemons/com.remote-agent.plist
    echo "✅ Stopped agent service"
fi

# Kill any running agent processes
pkill -f remote-agent
sleep 2

echo "🧹 Removing agent files..."

# Remove agent binary
if [ -f "/usr/local/bin/remote-agent" ]; then
    rm -f /usr/local/bin/remote-agent
    echo "✅ Removed /usr/local/bin/remote-agent"
fi

# Remove config
if [ -d "/etc/remote-agent" ]; then
    rm -rf /etc/remote-agent
    echo "✅ Removed /etc/remote-agent"
fi

# Remove LaunchDaemon (macOS)
if [ -f "/Library/LaunchDaemons/com.remote-agent.plist" ]; then
    rm -f /Library/LaunchDaemons/com.remote-agent.plist
    echo "✅ Removed LaunchDaemon"
fi

# Remove log files
if [ -f "/var/log/remote-agent.log" ]; then
    rm -f /var/log/remote-agent.log /var/log/remote-agent.error.log
    echo "✅ Removed log files"
fi

echo ""
echo "✅ Uninstall complete!"
echo ""
echo "The agent has been completely removed from this system."
`;
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename="uninstall-agent.sh"');
        res.send(uninstallScript);
    }
};
exports.AgentDownloadController = AgentDownloadController;
__decorate([
    (0, common_1.Get)('download/macos'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentDownloadController.prototype, "downloadMacOS", null);
__decorate([
    (0, common_1.Get)('download/windows'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentDownloadController.prototype, "downloadWindows", null);
__decorate([
    (0, common_1.Delete)('uninstall/:hostId'),
    __param(0, (0, common_1.Param)('hostId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AgentDownloadController.prototype, "uninstallAgent", null);
__decorate([
    (0, common_1.Get)('uninstall-script'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentDownloadController.prototype, "getUninstallScript", null);
exports.AgentDownloadController = AgentDownloadController = __decorate([
    (0, common_1.Controller)('agent'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AgentDownloadController);
//# sourceMappingURL=agent-download.controller.js.map