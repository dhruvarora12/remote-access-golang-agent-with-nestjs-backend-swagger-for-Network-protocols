import { Controller, Post, Body, Get, Param, Query, Logger } from '@nestjs/common';  // ✅ Add Logger to imports
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AgentGateway } from './agent.gateway';
import { SendCommandDto, CommandResultDto, ListFilesDto, DownloadFileDto, UploadFileDto, DeleteFileDto, NetworkScanDto } from './agent.dto';
import { PrismaService } from '../../prisma/prisma.service'; 

@ApiTags('agents')
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger('AgentController');  // ✅ Move logger here

  constructor(
    private readonly agentGateway: AgentGateway,
    private readonly prisma: PrismaService,  // ✅ Add comma, remove logger from here
  ) {}

  @Get('list')
  async listAgents() {
    try {
      const connectedAgents = this.agentGateway.getConnectedAgents();
      
      const hosts = await this.prisma.host.findMany({
        where: {
          // Only show real connected agents, not placeholders
          AND: [
            {
              OR: [
                { agentConnected: true },
                { agentInstalled: true },
              ],
            },
            {
              // Exclude placeholder IPs
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
    } catch (error) {
      this.logger.error('Failed to get agent list:', error);
      throw new Error('Failed to retrieve agent list');
    }
  }

  @Post('command')
  @ApiOperation({ summary: 'Send command to an agent' })
  @ApiResponse({ status: 200, description: 'Command sent successfully' })
  async sendCommand(@Body() body: SendCommandDto) {
    const { hostId, command } = body;
    
    const success = await this.agentGateway.sendCommandToAgent(hostId, command);
    
    if (success) {
      return { success: true, message: `Command sent to host ${hostId}` };
    } else {
      return { success: false, message: `Host ${hostId} agent not connected` };
    }
  }

@Get('info/:hostId')
@ApiOperation({ summary: 'Get agent system information' })
@ApiResponse({ status: 200, description: 'Returns agent system info' })
async getAgentInfo(@Param('hostId') hostId: string) {
  // Try memory first (real-time)
  let info = this.agentGateway.getAgentSystemInfo(hostId);
  
  if (!info) {
    // Fall back to database
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

@Get('history/:hostId')
@ApiOperation({ summary: 'Get command history for a host' })
@ApiResponse({ status: 200, description: 'Returns command history' })
async getCommandHistory(
  @Param('hostId') hostId: string,
  @Query('limit') limit?: number,
) {
  const history = await this.agentGateway.getCommandHistory(
    hostId,
    limit ? parseInt(limit.toString()) : 50
  );
  
  return {
    success: true,
    hostId: hostId,
    count: history.length,
    commands: history.map(cmd => {
      // Use parsed output if available, otherwise parse raw output
      let output: any = cmd.parsedOutput;
      
      // If parsedOutput is just wrapped lines, try to parse raw as JSON
      if (
        output && 
        typeof output === 'object' && 
        'lines' in output && 
        Array.isArray(output.lines) && 
        output.lines.length === 1 &&
        cmd.rawOutput
      ) {
        try {
          const rawJson = JSON.parse(cmd.rawOutput);
          output = rawJson;
        } catch (e) {
          // Keep parsedOutput as is
        }
      }
      
      return {
        id: cmd.id,
        hostId: cmd.hostId,
        command: cmd.command,
        output: output,
        rawOutput: cmd.rawOutput || '', // Provide empty string if null
        error: cmd.error,
        exitCode: cmd.exitCode,
        status: cmd.status,
        executedAt: cmd.executedAt,
        completedAt: cmd.completedAt,
      };
    })
  };
}


  @Post('files/list')
  @ApiOperation({ summary: 'List files in a directory' })
  async listFiles(@Body() body: ListFilesDto) {
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
      } catch (e) {
        return { success: false, error: 'Failed to parse file list' };
      }
    }
    
    return { success: false, message: 'No response from agent' };
  }

  @Post('files/download')
  @ApiOperation({ summary: 'Download a file' })
  async downloadFile(@Body() body: DownloadFileDto) {
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
      } catch (e) {
        return { success: false, error: 'Failed to parse file data' };
      }
    }
    
    return { success: false, message: 'No response from agent' };
  }

  @Post('files/upload')
  @ApiOperation({ summary: 'Upload a file' })
  async uploadFile(@Body() body: UploadFileDto) {
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
      } catch (e) {
        return { success: false, error: 'Failed to parse upload result' };
      }
    }
    
    return { success: false, message: 'No response from agent' };
  }

  @Post('files/delete')
  @ApiOperation({ summary: 'Delete a file or folder' })
  async deleteFile(@Body() body: DeleteFileDto) {
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
      } catch (e) {
        return { success: false, error: 'Failed to parse delete result' };
      }
    }
    
    return { success: false, message: 'No response from agent' };
  }

  @Post('network/scan')
  @ApiOperation({ summary: 'Scan network for devices' })
  async scanNetwork(@Body() body: NetworkScanDto) {
    const { hostId } = body;
    
    // Check if this is a mock request (use dummy hostId: 'mock' or 'demo')
    if (hostId === 'mock' || hostId === 'demo' || hostId === 'test') {
      return this.generateMockNetworkScan();
    }
    
    const command = 'NETWORK_SCAN';
    const success = await this.agentGateway.sendCommandToAgent(hostId, command);
    
    if (!success) {
      return { success: false, message: 'Agent not connected' };
    }
    
    // Poll for results instead of just waiting
    const maxWait = 45000; // 45 seconds max
    const pollInterval = 2000; // Check every 2 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      // Check memory first
      let result = this.agentGateway.getCommandResult(hostId, false);
      
      // If not in memory, check database
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
        // Clean up from memory
        this.agentGateway.getCommandResult(hostId, true);
        
        try {
          const scanResult = JSON.parse(result.output);
          return {
            success: true,
            hostId: hostId,
            ...scanResult
          };
        } catch (e) {
          return { success: false, error: 'Failed to parse scan result', raw: result.output };
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    return { success: false, message: 'No response - timeout after 45s' };
  }

  private generateMockNetworkScan() {
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

    const devices: any[] = [];
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

  @Get('network/scan/mock')
  @ApiOperation({ summary: 'Mock network scan with 30+ devices for testing' })
  @ApiResponse({ status: 200, description: 'Returns mock scan data' })
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

    const devices: any[] = [];
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
}