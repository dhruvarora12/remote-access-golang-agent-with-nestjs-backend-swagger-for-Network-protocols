import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface AgentConnection {
  socket: Socket;
  socketId: string;
  hostId: string;
  ipAddress: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('AgentGateway');
  private agents = new Map<string, AgentConnection>();
  private socketToHostId = new Map<string, string>();
  private ipToHostId = new Map<string, string>();
  private commandResults = new Map<string, any>();
  private agentSystemInfo = new Map<string, any>();

  constructor(private prisma: PrismaService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connecting: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
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
      } catch (error) {
        this.logger.error('Failed to update host status:', error);
      }
      
      this.agentSystemInfo.delete(hostId);
    }
  }

  private extractSystemInfo(systemInfo: any) {
    const result: any = {
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
      let primaryInterface: any = null;

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
      } else {
        for (const ifaceName of priorityInterfaces) {
          const iface = systemInfo.network.find((i: any) => i.name === ifaceName);
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

  @SubscribeMessage('register')
  async handleRegister(client: Socket, data: any) {
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
          
          // ✅ Prepare update data - handle all unique constraints
          const updateData: any = {
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

          // ✅ Only update ipAddress if it's different from current
          if (ipAddress !== host.ipAddress) {
            // Check if another host already has this IP address
            const existingIpHost = await this.prisma.host.findFirst({
              where: {
                ipAddress: ipAddress,
                id: { not: host.id },
              },
            });

            if (!existingIpHost) {
              updateData.ipAddress = ipAddress;
            } else {
              this.logger.warn(
                `⚠️ IP address '${ipAddress}' already assigned to host ${existingIpHost.id}, keeping current IP '${host.ipAddress}'`,
              );
            }
          }

          // ✅ Only update hostName if it's different from current
          if (extractedData.hostname && extractedData.hostname !== host.hostName) {
            // Check if another host already has this hostname
            const existingHostnameHost = await this.prisma.host.findFirst({
              where: {
                hostName: extractedData.hostname,
                id: { not: host.id },
              },
            });

            if (!existingHostnameHost) {
              updateData.hostName = extractedData.hostname;
            } else {
              this.logger.warn(
                `⚠️ Hostname '${extractedData.hostname}' already exists, keeping current hostname '${host.hostName}'`,
              );
            }
          }
          
          await this.prisma.host.update({
            where: { id: host.id },
            data: updateData,
          });
          
          this.logger.log(`✅ Updated host ${host.id} with agent data`);
        } else {
          this.logger.error(`❌ Invalid hostId: ${hostId} not found in database`);
          client.emit('error', 'Invalid hostId');
          return;
        }
      } else {
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
        
        // ✅ Also check by IP address
        if (!host && ipAddress) {
          this.logger.log(`Looking for host by IP: ${ipAddress}`);
          host = await this.prisma.host.findFirst({
            where: { ipAddress: ipAddress }
          });
        }
        
        if (host) {
          this.logger.log(`✅ Found existing host: ${host.id}`);
          
          // ✅ Prepare update data - handle all unique constraints
          const updateData: any = {
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

          // ✅ Only update ipAddress if it's different from current
          if (ipAddress !== host.ipAddress) {
            // Check if another host already has this IP address
            const existingIpHost = await this.prisma.host.findFirst({
              where: {
                ipAddress: ipAddress,
                id: { not: host.id },
              },
            });

            if (!existingIpHost) {
              updateData.ipAddress = ipAddress;
            } else {
              this.logger.warn(
                `⚠️ IP address '${ipAddress}' already assigned to host ${existingIpHost.id}, keeping current IP '${host.ipAddress}'`,
              );
            }
          }

          // ✅ Only update hostName if it's different from current
          if (extractedData.hostname && extractedData.hostname !== host.hostName) {
            // Check if another host already has this hostname
            const existingHostnameHost = await this.prisma.host.findFirst({
              where: {
                hostName: extractedData.hostname,
                id: { not: host.id },
              },
            });

            if (!existingHostnameHost) {
              updateData.hostName = extractedData.hostname;
            } else {
              this.logger.warn(
                `⚠️ Hostname '${extractedData.hostname}' already exists, keeping current hostname '${host.hostName}'`,
              );
            }
          }
          
          await this.prisma.host.update({
            where: { id: host.id },
            data: updateData,
          });
        } else {
          this.logger.log(`⚠️ No existing host found, creating new host...`);
          
          // ✅ Generate unique hostname if needed
          let finalHostname = extractedData.hostname || `host-${ipAddress}`;
          
          const existingHostname = await this.prisma.host.findFirst({
            where: { hostName: finalHostname },
          });

          if (existingHostname) {
            finalHostname = `${finalHostname}-${Date.now()}`;
            this.logger.warn(`⚠️ Hostname conflict, using unique name: ${finalHostname}`);
          }

          // ✅ Check if IP address is already taken
          const existingIp = await this.prisma.host.findFirst({
            where: { ipAddress: ipAddress },
          });

          if (existingIp) {
            this.logger.error(`❌ IP address ${ipAddress} already assigned to host ${existingIp.id}`);
            // Use the existing host instead of creating a new one
            host = existingIp;
            
            // Update the existing host
            const updateData: any = {
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

            // Update hostname if different and not conflicting
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
          } else {
            // Create new host
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
      
    } catch (error) {
      this.logger.error('❌ Failed to register agent:', error);
      client.emit('error', 'Failed to register agent');
      return;
    }
    
    return {
      event: 'registered',
      data: { hostId: host.id, message: 'Successfully registered' },
    };
  }

  @SubscribeMessage('command_result')
  async handleCommandResult(client: Socket, data: any) {
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
    } catch (error) {
      this.logger.error('Failed to save command result:', error);
    }
    
    return { event: 'ack', data: 'Result received' };
  }

  async sendCommandToAgent(hostId: string, command: string) {
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
      } catch (error) {
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

  getCommandResult(hostId: string, deleteAfterRead: boolean = true) {
    const result = this.commandResults.get(hostId);
    if (result) {
      if (deleteAfterRead) {
        this.commandResults.delete(hostId);
      }
      return result;
    }
    return null;
  }

  getAgentSystemInfo(hostId: string) {
    return this.agentSystemInfo.get(hostId);
  }

  async getAgentFromDB(hostId: string) {
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
    } catch (error) {
      this.logger.error('Failed to get host from database:', error);
      return null;
    }
  }

  async getCommandHistory(hostId: string, limit: number = 50) {
    try {
      return await this.prisma.commandHistory.findMany({
        where: { hostId },
        orderBy: { executedAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      this.logger.error('Failed to get command history:', error);
      return [];
    }
  }

  private parseCommandOutput(command: string, rawOutput: string): any {
    const cmd = command.trim().toLowerCase();
    
    if (cmd === 'network_scan' || cmd.includes('file_') || rawOutput.startsWith('{')) {
      try {
        return JSON.parse(rawOutput);
      } catch (e) {
        // If JSON parse fails, treat as regular output
      }
    }
    
    if (cmd === 'ifconfig' || cmd.startsWith('ifconfig')) {
      return this.parseIfconfig(rawOutput);
    } else if (cmd === 'ls' || cmd.startsWith('ls')) {
      return this.parseLs(rawOutput);
    } else if (cmd === 'whoami') {
      return { user: rawOutput.trim() };
    } else if (cmd === 'pwd') {
      return { directory: rawOutput.trim() };
    }
    
    return { lines: rawOutput.split('\n').filter(line => line.trim()) };
  }

  private parseIfconfig(output: string): any {
    const interfaces: any[] = [];
    const blocks = output.split(/^(?=\w)/m);
    
    for (const block of blocks) {
      if (!block.trim()) continue;
      
      const lines = block.split('\n');
      const firstLine = lines[0];
      const name = firstLine.split(':')[0];
      
      const iface: any = { name };
      
      const ipv4Match = block.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
      if (ipv4Match) iface.ipv4 = ipv4Match[1];
      
      const ipv6Matches = block.match(/inet6\s+([^\s]+)/g);
      if (ipv6Matches) {
        iface.ipv6 = ipv6Matches.map(m => m.replace('inet6 ', ''));
      }
      
      if (block.includes('status: active')) iface.status = 'active';
      else if (block.includes('status: inactive')) iface.status = 'inactive';
      
      const macMatch = block.match(/ether\s+([^\s]+)/);
      if (macMatch) iface.mac = macMatch[1];
      
      interfaces.push(iface);
    }
    
    return { interfaces };
  }

  private parseLs(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    const files: any[] = [];
    
    for (const line of lines) {
      if (line.startsWith('total')) continue;
      
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

  @SubscribeMessage('test_command')
  handleTestCommand(client: Socket, data: any) {
    const command = data.command || 'whoami';
    this.logger.log(`Testing command: ${command}`);
    
    this.agents.forEach((agentConnection, hostId) => {
      agentConnection.socket.emit('execute_command', { command });
      this.logger.log(`Sent "${command}" to host ${hostId}`);
    });
    
    return { event: 'test_sent', data: 'Command sent to all agents' };
  }
}
