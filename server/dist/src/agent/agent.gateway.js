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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AgentGateway = class AgentGateway {
    prisma;
    server;
    logger = new common_1.Logger('AgentGateway');
    agents = new Map();
    socketToHostId = new Map();
    ipToHostId = new Map();
    commandResults = new Map();
    agentSystemInfo = new Map();
    constructor(prisma) {
        this.prisma = prisma;
    }
    handleConnection(client) {
        this.logger.log(`Client connecting: ${client.id}`);
    }
    async handleDisconnect(client) {
        this.logger.log(`Client disconnected: ${client.id}`);
        const hostId = this.socketToHostId.get(client.id);
        if (hostId) {
            this.socketToHostId.delete(client.id);
            const agentConnection = this.agents.get(hostId);
            if (agentConnection) {
                this.ipToHostId.delete(agentConnection.ipAddress);
            }
            try {
                await this.prisma.host.update({
                    where: { id: hostId },
                    data: {
                        agentConnected: false,
                        agentLastSeen: new Date(),
                    },
                });
                this.logger.log(`Marked host ${hostId} agent as disconnected`);
            }
            catch (error) {
                this.logger.error('Failed to update host status:', error);
            }
            this.agentSystemInfo.delete(hostId);
        }
    }
    extractSystemInfo(systemInfo) {
        const result = {
            ipAddress: null,
            macAddress: null,
            os: systemInfo.os || null,
            arch: systemInfo.arch || null,
            platform: systemInfo.platform || null,
            hostname: systemInfo.hostname || null,
            cpuInfo: systemInfo.cpu || null,
            memoryInfo: systemInfo.memory || null,
            diskInfo: systemInfo.disk || null,
        };
        if (systemInfo.network && Array.isArray(systemInfo.network)) {
            const priorityInterfaces = ['en0', 'en1', 'eth0', 'eth1'];
            let primaryInterface = null;
            for (const iface of systemInfo.network) {
                if (!iface.addrs || iface.name === 'lo0' || iface.name === 'lo') {
                    continue;
                }
                for (const addr of iface.addrs) {
                    if (typeof addr === 'string') {
                        const ipMatch = addr.match(/^(\d+\.\d+\.\d+\.\d+)/);
                        if (ipMatch) {
                            const ip = ipMatch[1];
                            if (!ip.startsWith('127.') && !ip.startsWith('169.254.') && !ip.startsWith('224.')) {
                                result.ipAddress = ip;
                                primaryInterface = iface;
                                this.logger.log(`✅ Extracted IP address: ${ip} from interface ${iface.name}`);
                                break;
                            }
                        }
                    }
                }
                if (result.ipAddress) {
                    break;
                }
            }
            if (primaryInterface && primaryInterface.mac_address) {
                result.macAddress = primaryInterface.mac_address;
                this.logger.log(`✅ Extracted MAC address: ${result.macAddress} from primary interface ${primaryInterface.name}`);
            }
            else {
                for (const ifaceName of priorityInterfaces) {
                    const iface = systemInfo.network.find((i) => i.name === ifaceName);
                    if (iface && iface.mac_address && iface.mac_address !== '00:00:00:00:00:00') {
                        result.macAddress = iface.mac_address;
                        this.logger.log(`✅ Extracted MAC address: ${result.macAddress} from ${ifaceName}`);
                        break;
                    }
                }
            }
        }
        return result;
    }
    async handleRegister(client, data) {
        this.logger.log(`Agent registering with socket: ${client.id}`);
        this.logger.log(`System Info: ${JSON.stringify(data, null, 2)}`);
        const extractedData = this.extractSystemInfo(data);
        const ipAddress = extractedData.ipAddress;
        const hostname = extractedData.hostname;
        const hostId = data.hostId;
        if (!ipAddress) {
            this.logger.error('❌ No IP address found in registration data');
            client.emit('error', 'No IP address found');
            return;
        }
        this.logger.log(`✅ Extracted IP address: ${ipAddress}`);
        if (hostname) {
            this.logger.log(`✅ Extracted hostname: ${hostname}`);
        }
        if (hostId) {
            this.logger.log(`✅ Received hostId: ${hostId}`);
        }
        let host;
        try {
            if (hostId) {
                this.logger.log(`Looking for host by hostId: ${hostId}`);
                host = await this.prisma.host.findUnique({
                    where: { id: hostId }
                });
                if (host) {
                    this.logger.log(`✅ Found existing host: ${host.id}`);
                    const updateData = {
                        socketId: client.id,
                        macAddress: extractedData.macAddress,
                        os: extractedData.os,
                        arch: extractedData.arch,
                        platform: extractedData.platform,
                        cpuInfo: extractedData.cpuInfo,
                        memoryInfo: extractedData.memoryInfo,
                        diskInfo: extractedData.diskInfo,
                        systemInfo: data,
                        agentInstalled: true,
                        agentConnected: true,
                        agentLastSeen: new Date(),
                        agentInstalledAt: host.agentInstalledAt || new Date(),
                        agentVersion: data.agentVersion || null,
                    };
                    if (ipAddress !== host.ipAddress) {
                        const existingIpHost = await this.prisma.host.findFirst({
                            where: {
                                ipAddress: ipAddress,
                                id: { not: host.id },
                            },
                        });
                        if (!existingIpHost) {
                            updateData.ipAddress = ipAddress;
                        }
                        else {
                            this.logger.warn(`⚠️ IP address '${ipAddress}' already assigned to host ${existingIpHost.id}, keeping current IP '${host.ipAddress}'`);
                        }
                    }
                    if (extractedData.hostname && extractedData.hostname !== host.hostName) {
                        const existingHostnameHost = await this.prisma.host.findFirst({
                            where: {
                                hostName: extractedData.hostname,
                                id: { not: host.id },
                            },
                        });
                        if (!existingHostnameHost) {
                            updateData.hostName = extractedData.hostname;
                        }
                        else {
                            this.logger.warn(`⚠️ Hostname '${extractedData.hostname}' already exists, keeping current hostname '${host.hostName}'`);
                        }
                    }
                    await this.prisma.host.update({
                        where: { id: host.id },
                        data: updateData,
                    });
                    this.logger.log(`✅ Updated host ${host.id} with agent data`);
                }
                else {
                    this.logger.error(`❌ Invalid hostId: ${hostId} not found in database`);
                    client.emit('error', 'Invalid hostId');
                    return;
                }
            }
            else {
                this.logger.log(`⚠️ No hostId provided, falling back to MAC/hostname matching`);
                const macAddress = extractedData.macAddress;
                if (macAddress) {
                    this.logger.log(`Looking for host by MAC: ${macAddress}`);
                    host = await this.prisma.host.findFirst({
                        where: { macAddress: macAddress }
                    });
                }
                if (!host && hostname) {
                    this.logger.log(`Looking for host by hostname: ${hostname}`);
                    host = await this.prisma.host.findFirst({
                        where: { hostName: hostname }
                    });
                }
                if (!host && ipAddress) {
                    this.logger.log(`Looking for host by IP: ${ipAddress}`);
                    host = await this.prisma.host.findFirst({
                        where: { ipAddress: ipAddress }
                    });
                }
                if (host) {
                    this.logger.log(`✅ Found existing host: ${host.id}`);
                    const updateData = {
                        socketId: client.id,
                        macAddress: extractedData.macAddress,
                        os: extractedData.os,
                        arch: extractedData.arch,
                        platform: extractedData.platform,
                        cpuInfo: extractedData.cpuInfo,
                        memoryInfo: extractedData.memoryInfo,
                        diskInfo: extractedData.diskInfo,
                        systemInfo: data,
                        agentInstalled: true,
                        agentConnected: true,
                        agentLastSeen: new Date(),
                        agentVersion: data.agentVersion || null,
                    };
                    if (ipAddress !== host.ipAddress) {
                        const existingIpHost = await this.prisma.host.findFirst({
                            where: {
                                ipAddress: ipAddress,
                                id: { not: host.id },
                            },
                        });
                        if (!existingIpHost) {
                            updateData.ipAddress = ipAddress;
                        }
                        else {
                            this.logger.warn(`⚠️ IP address '${ipAddress}' already assigned to host ${existingIpHost.id}, keeping current IP '${host.ipAddress}'`);
                        }
                    }
                    if (extractedData.hostname && extractedData.hostname !== host.hostName) {
                        const existingHostnameHost = await this.prisma.host.findFirst({
                            where: {
                                hostName: extractedData.hostname,
                                id: { not: host.id },
                            },
                        });
                        if (!existingHostnameHost) {
                            updateData.hostName = extractedData.hostname;
                        }
                        else {
                            this.logger.warn(`⚠️ Hostname '${extractedData.hostname}' already exists, keeping current hostname '${host.hostName}'`);
                        }
                    }
                    await this.prisma.host.update({
                        where: { id: host.id },
                        data: updateData,
                    });
                }
                else {
                    this.logger.log(`⚠️ No existing host found, creating new host...`);
                    let finalHostname = extractedData.hostname || `host-${ipAddress}`;
                    const existingHostname = await this.prisma.host.findFirst({
                        where: { hostName: finalHostname },
                    });
                    if (existingHostname) {
                        finalHostname = `${finalHostname}-${Date.now()}`;
                        this.logger.warn(`⚠️ Hostname conflict, using unique name: ${finalHostname}`);
                    }
                    const existingIp = await this.prisma.host.findFirst({
                        where: { ipAddress: ipAddress },
                    });
                    if (existingIp) {
                        this.logger.error(`❌ IP address ${ipAddress} already assigned to host ${existingIp.id}`);
                        host = existingIp;
                        const updateData = {
                            socketId: client.id,
                            macAddress: extractedData.macAddress,
                            os: extractedData.os,
                            arch: extractedData.arch,
                            platform: extractedData.platform,
                            cpuInfo: extractedData.cpuInfo,
                            memoryInfo: extractedData.memoryInfo,
                            diskInfo: extractedData.diskInfo,
                            systemInfo: data,
                            agentInstalled: true,
                            agentConnected: true,
                            agentLastSeen: new Date(),
                            agentVersion: data.agentVersion || null,
                        };
                        if (extractedData.hostname && extractedData.hostname !== host.hostName) {
                            const hostNameCheck = await this.prisma.host.findFirst({
                                where: {
                                    hostName: extractedData.hostname,
                                    id: { not: host.id },
                                },
                            });
                            if (!hostNameCheck) {
                                updateData.hostName = extractedData.hostname;
                            }
                        }
                        await this.prisma.host.update({
                            where: { id: host.id },
                            data: updateData,
                        });
                        this.logger.log(`✅ Updated existing host ${host.id} with same IP`);
                    }
                    else {
                        host = await this.prisma.host.create({
                            data: {
                                hostName: finalHostname,
                                ipAddress,
                                socketId: client.id,
                                macAddress: extractedData.macAddress,
                                os: extractedData.os,
                                arch: extractedData.arch,
                                platform: extractedData.platform,
                                cpuInfo: extractedData.cpuInfo,
                                memoryInfo: extractedData.memoryInfo,
                                diskInfo: extractedData.diskInfo,
                                systemInfo: data,
                                agentInstalled: true,
                                agentConnected: true,
                                agentLastSeen: new Date(),
                                agentInstalledAt: new Date(),
                                agentVersion: data.agentVersion || null,
                                latitude: '0',
                                longitude: '0',
                                status: 'UP',
                            },
                        });
                        this.logger.log(`✅ Created new host ${host.id}`);
                    }
                }
            }
            this.agents.set(host.id, {
                socket: client,
                socketId: client.id,
                hostId: host.id,
                ipAddress: ipAddress,
            });
            this.socketToHostId.set(client.id, host.id);
            this.ipToHostId.set(ipAddress, host.id);
            this.logger.log(`Mapped: Socket ${client.id} → Host ${host.id} → IP ${ipAddress}`);
            this.agentSystemInfo.set(host.id, {
                ...data,
                connectedAt: new Date().toISOString()
            });
        }
        catch (error) {
            this.logger.error('❌ Failed to register agent:', error);
            client.emit('error', 'Failed to register agent');
            return;
        }
        return {
            event: 'registered',
            data: { hostId: host.id, message: 'Successfully registered' },
        };
    }
    async handleCommandResult(client, data) {
        this.logger.log(`Command result from ${client.id}:`);
        this.logger.log(data.output);
        const hostId = this.socketToHostId.get(client.id);
        if (hostId) {
            this.commandResults.set(hostId, {
                output: data.output,
                error: data.error,
                timestamp: Date.now()
            });
        }
        try {
            const commandRecord = await this.prisma.commandHistory.findFirst({
                where: {
                    hostId: hostId || client.id,
                    rawOutput: null,
                },
                orderBy: {
                    executedAt: 'desc',
                },
            });
            if (commandRecord) {
                const parsedOutput = this.parseCommandOutput(commandRecord.command, data.output);
                await this.prisma.commandHistory.update({
                    where: { id: commandRecord.id },
                    data: {
                        rawOutput: data.output,
                        parsedOutput: parsedOutput,
                        error: data.error || null,
                        exitCode: 0,
                        completedAt: new Date(),
                        status: 'completed',
                    },
                });
                this.logger.log(`Command result saved for host ${hostId}`);
            }
        }
        catch (error) {
            this.logger.error('Failed to save command result:', error);
        }
        return { event: 'ack', data: 'Result received' };
    }
    async sendCommandToAgent(hostId, command) {
        const agentConnection = this.agents.get(hostId);
        if (agentConnection) {
            try {
                await this.prisma.commandHistory.create({
                    data: {
                        hostId,
                        command,
                        status: 'pending',
                    },
                });
                this.logger.log(`Command saved to database for host ${hostId}`);
            }
            catch (error) {
                this.logger.error('Failed to save command to database:', error);
            }
            agentConnection.socket.emit('execute_command', { command });
            this.logger.log(`Sent command to host ${hostId} (IP: ${agentConnection.ipAddress}): ${command}`);
            return true;
        }
        this.logger.warn(`Host ${hostId} agent not connected`);
        return false;
    }
    getConnectedAgents() {
        return Array.from(this.agents.keys());
    }
    getCommandResult(hostId, deleteAfterRead = true) {
        const result = this.commandResults.get(hostId);
        if (result) {
            if (deleteAfterRead) {
                this.commandResults.delete(hostId);
            }
            return result;
        }
        return null;
    }
    getAgentSystemInfo(hostId) {
        return this.agentSystemInfo.get(hostId);
    }
    async getAgentFromDB(hostId) {
        try {
            return await this.prisma.host.findUnique({
                where: { id: hostId },
                include: {
                    commands: {
                        orderBy: { executedAt: 'desc' },
                        take: 50,
                    },
                },
            });
        }
        catch (error) {
            this.logger.error('Failed to get host from database:', error);
            return null;
        }
    }
    async getCommandHistory(hostId, limit = 50) {
        try {
            return await this.prisma.commandHistory.findMany({
                where: { hostId },
                orderBy: { executedAt: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            this.logger.error('Failed to get command history:', error);
            return [];
        }
    }
    parseCommandOutput(command, rawOutput) {
        const cmd = command.trim().toLowerCase();
        if (cmd === 'network_scan' || cmd.includes('file_') || rawOutput.startsWith('{')) {
            try {
                return JSON.parse(rawOutput);
            }
            catch (e) {
            }
        }
        if (cmd === 'ifconfig' || cmd.startsWith('ifconfig')) {
            return this.parseIfconfig(rawOutput);
        }
        else if (cmd === 'ls' || cmd.startsWith('ls')) {
            return this.parseLs(rawOutput);
        }
        else if (cmd === 'whoami') {
            return { user: rawOutput.trim() };
        }
        else if (cmd === 'pwd') {
            return { directory: rawOutput.trim() };
        }
        return { lines: rawOutput.split('\n').filter(line => line.trim()) };
    }
    parseIfconfig(output) {
        const interfaces = [];
        const blocks = output.split(/^(?=\w)/m);
        for (const block of blocks) {
            if (!block.trim())
                continue;
            const lines = block.split('\n');
            const firstLine = lines[0];
            const name = firstLine.split(':')[0];
            const iface = { name };
            const ipv4Match = block.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
            if (ipv4Match)
                iface.ipv4 = ipv4Match[1];
            const ipv6Matches = block.match(/inet6\s+([^\s]+)/g);
            if (ipv6Matches) {
                iface.ipv6 = ipv6Matches.map(m => m.replace('inet6 ', ''));
            }
            if (block.includes('status: active'))
                iface.status = 'active';
            else if (block.includes('status: inactive'))
                iface.status = 'inactive';
            const macMatch = block.match(/ether\s+([^\s]+)/);
            if (macMatch)
                iface.mac = macMatch[1];
            interfaces.push(iface);
        }
        return { interfaces };
    }
    parseLs(output) {
        const lines = output.split('\n').filter(line => line.trim());
        const files = [];
        for (const line of lines) {
            if (line.startsWith('total'))
                continue;
            const parts = line.split(/\s+/);
            if (parts.length >= 9) {
                files.push({
                    permissions: parts[0],
                    owner: parts[2],
                    group: parts[3],
                    size: parts[4],
                    name: parts.slice(8).join(' ')
                });
            }
        }
        return { files };
    }
    handleTestCommand(client, data) {
        const command = data.command || 'whoami';
        this.logger.log(`Testing command: ${command}`);
        this.agents.forEach((agentConnection, hostId) => {
            agentConnection.socket.emit('execute_command', { command });
            this.logger.log(`Sent "${command}" to host ${hostId}`);
        });
        return { event: 'test_sent', data: 'Command sent to all agents' };
    }
};
exports.AgentGateway = AgentGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], AgentGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('register'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], AgentGateway.prototype, "handleRegister", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('command_result'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], AgentGateway.prototype, "handleCommandResult", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('test_command'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], AgentGateway.prototype, "handleTestCommand", null);
exports.AgentGateway = AgentGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AgentGateway);
//# sourceMappingURL=agent.gateway.js.map