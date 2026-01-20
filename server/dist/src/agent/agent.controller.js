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
exports.AgentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const agent_gateway_1 = require("./agent.gateway");
const agent_dto_1 = require("./agent.dto");
const prisma_service_1 = require("../../prisma/prisma.service");
let AgentController = class AgentController {
    agentGateway;
    prisma;
    logger = new common_1.Logger('AgentController');
    constructor(agentGateway, prisma) {
        this.agentGateway = agentGateway;
        this.prisma = prisma;
    }
    async listAgents() {
        try {
            const connectedAgents = this.agentGateway.getConnectedAgents();
            const hosts = await this.prisma.host.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                { agentConnected: true },
                                { agentInstalled: true },
                            ],
                        },
                        {
                            ipAddress: {
                                not: {
                                    startsWith: '0.0.0.',
                                },
                            },
                        },
                    ],
                },
                select: {
                    id: true,
                    hostName: true,
                    ipAddress: true,
                    macAddress: true,
                    os: true,
                    platform: true,
                    agentConnected: true,
                    agentLastSeen: true,
                    agentInstalledAt: true,
                },
                orderBy: {
                    agentLastSeen: 'desc',
                },
            });
            return {
                count: hosts.length,
                connectedCount: connectedAgents.length,
                hosts: hosts.map(h => h.id),
                details: hosts.map(host => ({
                    hostId: host.id,
                    hostname: host.hostName,
                    ipAddress: host.ipAddress,
                    macAddress: host.macAddress,
                    os: host.os,
                    platform: host.platform,
                    agentConnected: host.agentConnected,
                    agentLastSeen: host.agentLastSeen,
                    agentInstalledAt: host.agentInstalledAt,
                    isOnline: connectedAgents.includes(host.id),
                })),
            };
        }
        catch (error) {
            this.logger.error('Failed to get agent list:', error);
            throw new Error('Failed to retrieve agent list');
        }
    }
    async sendCommand(body) {
        const { hostId, command } = body;
        const success = await this.agentGateway.sendCommandToAgent(hostId, command);
        if (success) {
            return { success: true, message: `Command sent to host ${hostId}` };
        }
        else {
            return { success: false, message: `Host ${hostId} agent not connected` };
        }
    }
    async getAgentInfo(hostId) {
        let info = this.agentGateway.getAgentSystemInfo(hostId);
        if (!info) {
            const host = await this.agentGateway.getAgentFromDB(hostId);
            if (host && host.systemInfo) {
                info = host.systemInfo;
            }
        }
        if (info) {
            return {
                success: true,
                hostId: hostId,
                systemInfo: info,
                source: info.connectedAt ? 'realtime' : 'database',
            };
        }
        return {
            success: false,
            message: 'Agent not found or system info not available',
            hostId: hostId
        };
    }
    async getCommandHistory(hostId, limit) {
        const history = await this.agentGateway.getCommandHistory(hostId, limit ? parseInt(limit.toString()) : 50);
        return {
            success: true,
            hostId: hostId,
            count: history.length,
            commands: history.map(cmd => {
                let output = cmd.parsedOutput;
                if (output &&
                    typeof output === 'object' &&
                    'lines' in output &&
                    Array.isArray(output.lines) &&
                    output.lines.length === 1 &&
                    cmd.rawOutput) {
                    try {
                        const rawJson = JSON.parse(cmd.rawOutput);
                        output = rawJson;
                    }
                    catch (e) {
                    }
                }
                return {
                    id: cmd.id,
                    hostId: cmd.hostId,
                    command: cmd.command,
                    output: output,
                    rawOutput: cmd.rawOutput || '',
                    error: cmd.error,
                    exitCode: cmd.exitCode,
                    status: cmd.status,
                    executedAt: cmd.executedAt,
                    completedAt: cmd.completedAt,
                };
            })
        };
    }
    async listFiles(body) {
        const { hostId, path } = body;
        const command = `FILE_LIST:${path}`;
        const success = await this.agentGateway.sendCommandToAgent(hostId, command);
        if (!success) {
            return { success: false, message: 'Agent not connected' };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = this.agentGateway.getCommandResult(hostId);
        if (result && result.output) {
            try {
                const fileList = JSON.parse(result.output);
                return {
                    success: true,
                    hostId: hostId,
                    ...fileList
                };
            }
            catch (e) {
                return { success: false, error: 'Failed to parse file list' };
            }
        }
        return { success: false, message: 'No response from agent' };
    }
    async downloadFile(body) {
        const { hostId, filePath } = body;
        const command = `FILE_READ:${filePath}`;
        const success = await this.agentGateway.sendCommandToAgent(hostId, command);
        if (!success) {
            return { success: false, message: 'Agent not connected' };
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
        const result = this.agentGateway.getCommandResult(hostId);
        if (result && result.output) {
            try {
                const fileData = JSON.parse(result.output);
                return {
                    success: true,
                    hostId: hostId,
                    ...fileData
                };
            }
            catch (e) {
                return { success: false, error: 'Failed to parse file data' };
            }
        }
        return { success: false, message: 'No response from agent' };
    }
    async uploadFile(body) {
        const { hostId, destinationPath, contentBase64 } = body;
        const command = `FILE_WRITE:${destinationPath}|${contentBase64}`;
        const success = await this.agentGateway.sendCommandToAgent(hostId, command);
        if (!success) {
            return { success: false, message: 'Agent not connected' };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = this.agentGateway.getCommandResult(hostId);
        if (result && result.output) {
            try {
                const writeResult = JSON.parse(result.output);
                return {
                    success: true,
                    hostId: hostId,
                    ...writeResult
                };
            }
            catch (e) {
                return { success: false, error: 'Failed to parse upload result' };
            }
        }
        return { success: false, message: 'No response from agent' };
    }
    async deleteFile(body) {
        const { hostId, filePath } = body;
        const command = `FILE_DELETE:${filePath}`;
        const success = await this.agentGateway.sendCommandToAgent(hostId, command);
        if (!success) {
            return { success: false, message: 'Agent not connected' };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = this.agentGateway.getCommandResult(hostId);
        if (result && result.output) {
            try {
                const deleteResult = JSON.parse(result.output);
                return {
                    success: true,
                    hostId: hostId,
                    ...deleteResult
                };
            }
            catch (e) {
                return { success: false, error: 'Failed to parse delete result' };
            }
        }
        return { success: false, message: 'No response from agent' };
    }
    async scanNetwork(body) {
        const { hostId } = body;
        if (hostId === 'mock' || hostId === 'demo' || hostId === 'test') {
            return this.generateMockNetworkScan();
        }
        const command = 'NETWORK_SCAN';
        const success = await this.agentGateway.sendCommandToAgent(hostId, command);
        if (!success) {
            return { success: false, message: 'Agent not connected' };
        }
        const maxWait = 45000;
        const pollInterval = 2000;
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            let result = this.agentGateway.getCommandResult(hostId, false);
            if (!result || !result.output) {
                const history = await this.agentGateway.getCommandHistory(hostId, 1);
                if (history.length > 0 && history[0].command === 'NETWORK_SCAN' && history[0].rawOutput) {
                    result = {
                        output: history[0].rawOutput,
                        error: history[0].error,
                        timestamp: history[0].completedAt?.getTime() || Date.now()
                    };
                }
            }
            if (result && result.output) {
                this.agentGateway.getCommandResult(hostId, true);
                try {
                    const scanResult = JSON.parse(result.output);
                    return {
                        success: true,
                        hostId: hostId,
                        ...scanResult
                    };
                }
                catch (e) {
                    return { success: false, error: 'Failed to parse scan result', raw: result.output };
                }
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        return { success: false, message: 'No response - timeout after 45s' };
    }
    generateMockNetworkScan() {
        const deviceTypes = [
            { type: 'Router/Firewall', vendor: 'Cisco Systems', ports: [80, 443, 22], services: ['Web Interface', 'SSH'] },
            { type: 'Computer', vendor: 'Dell', ports: [445, 3389], services: ['SMB/File Sharing', 'RDP'] },
            { type: 'Computer', vendor: 'Hewlett Packard', ports: [445, 22], services: ['SMB/File Sharing', 'SSH'] },
            { type: 'Mac/Apple Device', vendor: 'Apple', ports: [22, 445], services: ['SSH', 'SMB/File Sharing'] },
            { type: 'iPhone', vendor: 'Apple', ports: [], services: [] },
            { type: 'iPad', vendor: 'Apple', ports: [], services: [] },
            { type: 'Samsung Phone/Tablet', vendor: 'Samsung', ports: [], services: [] },
            { type: 'Network Printer', vendor: 'Canon', ports: [80, 443], services: ['Web Interface', 'HP JetDirect'] },
            { type: 'Network Printer', vendor: 'Epson', ports: [80], services: ['Web Interface'] },
            { type: 'IP Camera', vendor: 'Hikvision', ports: [80, 554], services: ['Web Interface', 'RTSP Streaming'] },
            { type: 'Raspberry Pi', vendor: 'Raspberry Pi Foundation', ports: [22, 80], services: ['SSH', 'Web Interface'] },
            { type: 'Virtual Machine', vendor: 'VMware', ports: [22, 80], services: ['SSH', 'Web Interface'] },
            { type: 'Virtual Machine', vendor: 'Parallels', ports: [445, 3389], services: ['SMB/File Sharing', 'RDP'] },
            { type: 'Router/Firewall', vendor: 'TP-Link', ports: [80, 443], services: ['Web Interface'] },
            { type: 'Router/Firewall', vendor: 'Netgear', ports: [80, 443], services: ['Web Interface'] },
        ];
        const hostnames = [
            'router', 'gateway', 'main-router', 'office-router',
            'desktop-01', 'laptop-02', 'workstation-03', 'pc-admin',
            'macbook-air', 'macbook-pro', 'imac-studio',
            'iphone-12', 'iphone-13', 'ipad-pro',
            'galaxy-s21', 'galaxy-tab',
            'printer-01', 'printer-floor2', 'hp-laserjet',
            'camera-entrance', 'camera-parking', 'cam-lobby',
            'raspberry-pi-1', 'rpi-server',
            'vm-test', 'vm-dev', 'parallels-win11',
            'ap-floor1', 'ap-floor2', 'switch-01',
        ];
        const devices = [];
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        for (let i = 1; i <= 35; i++) {
            const deviceTemplate = deviceTypes[i % deviceTypes.length];
            const mac = `00:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}`;
            devices.push({
                ip: `192.168.1.${i + 10}`,
                mac: mac,
                hostname: i <= hostnames.length ? hostnames[i - 1] : `device-${i}`,
                vendor: deviceTemplate.vendor,
                deviceType: deviceTemplate.type,
                status: Math.random() > 0.1 ? 'online' : 'offline',
                lastSeen: now,
                openPorts: deviceTemplate.ports,
                services: deviceTemplate.services,
            });
        }
        return {
            success: true,
            localIP: '192.168.1.100',
            network: '192.168.1.0/24',
            gateway: '192.168.1.1',
            devices: devices,
            totalDevices: devices.length,
            scanTime: now,
        };
    }
    async mockNetworkScan() {
        const deviceTypes = [
            { type: 'Router/Firewall', vendor: 'Cisco Systems', ports: [80, 443, 22], services: ['Web Interface', 'SSH'] },
            { type: 'Computer', vendor: 'Dell', ports: [445, 3389], services: ['SMB/File Sharing', 'RDP'] },
            { type: 'Computer', vendor: 'Hewlett Packard', ports: [445, 22], services: ['SMB/File Sharing', 'SSH'] },
            { type: 'Mac/Apple Device', vendor: 'Apple', ports: [22, 445], services: ['SSH', 'SMB/File Sharing'] },
            { type: 'iPhone', vendor: 'Apple', ports: [], services: [] },
            { type: 'iPad', vendor: 'Apple', ports: [], services: [] },
            { type: 'Samsung Phone/Tablet', vendor: 'Samsung', ports: [], services: [] },
            { type: 'Network Printer', vendor: 'Canon', ports: [80, 443], services: ['Web Interface', 'HP JetDirect'] },
            { type: 'Network Printer', vendor: 'Epson', ports: [80], services: ['Web Interface'] },
            { type: 'IP Camera', vendor: 'Hikvision', ports: [80, 554], services: ['Web Interface', 'RTSP Streaming'] },
            { type: 'Raspberry Pi', vendor: 'Raspberry Pi Foundation', ports: [22, 80], services: ['SSH', 'Web Interface'] },
            { type: 'Virtual Machine', vendor: 'VMware', ports: [22, 80], services: ['SSH', 'Web Interface'] },
            { type: 'Virtual Machine', vendor: 'Parallels', ports: [445, 3389], services: ['SMB/File Sharing', 'RDP'] },
            { type: 'Router/Firewall', vendor: 'TP-Link', ports: [80, 443], services: ['Web Interface'] },
            { type: 'Router/Firewall', vendor: 'Netgear', ports: [80, 443], services: ['Web Interface'] },
        ];
        const hostnames = [
            'router', 'gateway', 'main-router', 'office-router',
            'desktop-01', 'laptop-02', 'workstation-03', 'pc-admin',
            'macbook-air', 'macbook-pro', 'imac-studio',
            'iphone-12', 'iphone-13', 'ipad-pro',
            'galaxy-s21', 'galaxy-tab',
            'printer-01', 'printer-floor2', 'hp-laserjet',
            'camera-entrance', 'camera-parking', 'cam-lobby',
            'raspberry-pi-1', 'rpi-server',
            'vm-test', 'vm-dev', 'parallels-win11',
            'ap-floor1', 'ap-floor2', 'switch-01',
        ];
        const devices = [];
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        for (let i = 1; i <= 35; i++) {
            const deviceTemplate = deviceTypes[i % deviceTypes.length];
            const mac = `00:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}:${String(Math.floor(Math.random() * 256)).padStart(2, '0').toUpperCase()}`;
            devices.push({
                ip: `192.168.1.${i + 10}`,
                mac: mac,
                hostname: i <= hostnames.length ? hostnames[i - 1] : `device-${i}`,
                vendor: deviceTemplate.vendor,
                deviceType: deviceTemplate.type,
                status: Math.random() > 0.1 ? 'online' : 'offline',
                lastSeen: now,
                openPorts: deviceTemplate.ports,
                services: deviceTemplate.services,
            });
        }
        return {
            success: true,
            localIP: '192.168.1.100',
            network: '192.168.1.0/24',
            gateway: '192.168.1.1',
            devices: devices,
            totalDevices: devices.length,
            scanTime: now,
        };
    }
};
exports.AgentController = AgentController;
__decorate([
    (0, common_1.Get)('list'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "listAgents", null);
__decorate([
    (0, common_1.Post)('command'),
    (0, swagger_1.ApiOperation)({ summary: 'Send command to an agent' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Command sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_dto_1.SendCommandDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "sendCommand", null);
__decorate([
    (0, common_1.Get)('info/:hostId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get agent system information' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns agent system info' }),
    __param(0, (0, common_1.Param)('hostId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "getAgentInfo", null);
__decorate([
    (0, common_1.Get)('history/:hostId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get command history for a host' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns command history' }),
    __param(0, (0, common_1.Param)('hostId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "getCommandHistory", null);
__decorate([
    (0, common_1.Post)('files/list'),
    (0, swagger_1.ApiOperation)({ summary: 'List files in a directory' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_dto_1.ListFilesDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "listFiles", null);
__decorate([
    (0, common_1.Post)('files/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download a file' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_dto_1.DownloadFileDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "downloadFile", null);
__decorate([
    (0, common_1.Post)('files/upload'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload a file' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_dto_1.UploadFileDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "uploadFile", null);
__decorate([
    (0, common_1.Post)('files/delete'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a file or folder' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_dto_1.DeleteFileDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "deleteFile", null);
__decorate([
    (0, common_1.Post)('network/scan'),
    (0, swagger_1.ApiOperation)({ summary: 'Scan network for devices' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_dto_1.NetworkScanDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "scanNetwork", null);
__decorate([
    (0, common_1.Get)('network/scan/mock'),
    (0, swagger_1.ApiOperation)({ summary: 'Mock network scan with 30+ devices for testing' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns mock scan data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "mockNetworkScan", null);
exports.AgentController = AgentController = __decorate([
    (0, swagger_1.ApiTags)('agents'),
    (0, common_1.Controller)('agent'),
    __metadata("design:paramtypes", [agent_gateway_1.AgentGateway,
        prisma_service_1.PrismaService])
], AgentController);
//# sourceMappingURL=agent.controller.js.map