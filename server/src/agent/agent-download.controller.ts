import { Controller, Get, Delete, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('agent')
export class AgentDownloadController {
  constructor(private prisma: PrismaService) {}

  @Get('download/macos')
  async downloadMacOS(@Res() res: Response) {
    try {
      console.log('📥 macOS download request received');

      // Step 1: Create Host record
      const uniqueId = Date.now();
      const placeholderIP = `0.0.0.${uniqueId % 256}`;
      
      let host;
      const existingHost = await this.prisma.host.findFirst({
        where: { ipAddress: placeholderIP },
      });

      if (existingHost) {
        host = existingHost;
        console.log(`✅ Reusing existing placeholder host: ${host.id}`);
      } else {
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

      // Step 2: Build the PKG installer
      const agentDir = path.resolve(__dirname, '../../../../cmd/agent');
      const buildScript = path.join(agentDir, 'build-pkg.sh');

      console.log(`🔍 Looking for PKG build script at: ${buildScript}`);

      if (!fs.existsSync(buildScript)) {
        console.error('❌ PKG build script not found:', buildScript);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
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
      } catch (buildError) {
        console.error('❌ PKG build failed:', buildError);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'PKG build failed',
          error: buildError.message,
        });
      }

      // Step 3: Send the PKG installer
      const pkgPath = path.join(agentDir, `RemoteAgent-${host.id}.pkg`);

      if (!fs.existsSync(pkgPath)) {
        console.error('❌ PKG installer not found:', pkgPath);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'PKG installer not found',
        });
      }

      console.log(`📤 Sending PKG installer for host: ${host.id}`);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="RemoteAgent.pkg"`);

      const fileStream = fs.createReadStream(pkgPath);
      fileStream.pipe(res);

      // Clean up the PKG file after sending
      fileStream.on('end', () => {
        setTimeout(() => {
          try {
            fs.unlinkSync(pkgPath);
            console.log(`🧹 Cleaned up temporary PKG file: ${pkgPath}`);
          } catch (err) {
            console.error('⚠️ Failed to clean up PKG file:', err);
          }
        }, 1000);
      });

      fileStream.on('error', (err) => {
        console.error('❌ Error streaming PKG file:', err);
      });

    } catch (error) {
      console.error('❌ macOS download error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Download failed',
      });
    }
  }

  @Get('download/windows')
  async downloadWindows(@Res() res: Response) {
    try {
      console.log('📥 Windows download request received');

      // Step 1: Create Host record
      const uniqueId = Date.now();
      const placeholderIP = `0.0.0.${uniqueId % 256}`;
      
      let host;
      const existingHost = await this.prisma.host.findFirst({
        where: { ipAddress: placeholderIP },
      });

      if (existingHost) {
        host = existingHost;
        console.log(`✅ Reusing existing placeholder host: ${host.id}`);
      } else {
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

      // Step 2: Build the Windows executable
      const agentDir = path.resolve(__dirname, '../../../../cmd/agent');
      const buildScript = path.join(agentDir, 'build-windows.sh');

      console.log(`🔍 Looking for Windows build script at: ${buildScript}`);

      if (!fs.existsSync(buildScript)) {
        console.error('❌ Windows build script not found:', buildScript);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
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
      } catch (buildError) {
        console.error('❌ Windows build failed:', buildError);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Windows build failed',
          error: buildError.message,
        });
      }

      // Step 3: Send the Windows executable
      const exePath = path.join(agentDir, `RemoteAgent-${host.id}.exe`);

      if (!fs.existsSync(exePath)) {
        console.error('❌ Windows executable not found:', exePath);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Windows executable not found',
        });
      }

      console.log(`📤 Sending Windows executable for host: ${host.id}`);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="RemoteAgent.exe"`);

      const fileStream = fs.createReadStream(exePath);
      fileStream.pipe(res);

      // Clean up the exe file after sending
      fileStream.on('end', () => {
        setTimeout(() => {
          try {
            fs.unlinkSync(exePath);
            console.log(`🧹 Cleaned up temporary exe file: ${exePath}`);
          } catch (err) {
            console.error('⚠️ Failed to clean up exe file:', err);
          }
        }, 1000);
      });

      fileStream.on('error', (err) => {
        console.error('❌ Error streaming exe file:', err);
      });

    } catch (error) {
      console.error('❌ Windows download error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Download failed',
      });
    }
  }

  @Delete('uninstall/:hostId')
  async uninstallAgent(@Param('hostId') hostId: string, @Res() res: Response) {
    try {
      console.log(`🗑️ Uninstall request for host: ${hostId}`);

      const host = await this.prisma.host.findUnique({
        where: { id: hostId },
      });

      if (!host) {
        return res.status(HttpStatus.NOT_FOUND).json({
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

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Agent uninstalled successfully',
        data: {
          hostId: hostId,
          hostName: host.hostName,
          deletedCommands: deletedCommands.count,
        },
      });

    } catch (error) {
      console.error('❌ Uninstall error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Uninstall failed',
      });
    }
  }

  @Get('uninstall-script')
  async getUninstallScript(@Res() res: Response) {
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
}