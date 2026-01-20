import { Controller, Get, Res, Param, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service'; 

@Controller()
export class AppController {
  constructor(private readonly appService: AppService,
  private readonly prisma: PrismaService
){}  

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('install-agent.sh')
getInstallAgentScript(@Res() res: Response) {
  const filePath = path.join(__dirname, '../../install-agent.sh');
  
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Install script not found');
  }
}

  @Get('download/agent-mac')
@ApiOperation({ summary: 'Download macOS agent' })
async downloadAgentMac(@Res() res: Response) {
  const agentPath = join(__dirname, '..', '..', 'agent-mac');
  
  try {
    // Check if file exists
    if (!existsSync(agentPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent binary not found' 
      });
    }

    // Set proper headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="agent-mac"');
    res.setHeader('Accept-Ranges', 'none'); // Disable range requests
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream the file
    const fileStream = createReadStream(agentPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }
}
@Get('quick-install')
@ApiOperation({ summary: 'Download self-executing installer' })
async quickInstall(@Res() res: Response) {
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

// @Get('download-installer')
// @ApiOperation({ summary: 'Download macOS installer package' })
// async downloadInstaller(@Res() res: Response) {
//   const pkgFileId = '1xMEn-oxMIvaRTCRqDAw0WyOnzkDfW2j8';
//   const googleDriveUrl = `https://drive.google.com/uc?export=download&id=${pkgFileId}`;
  
//   // Redirect to Google Drive download
//   res.redirect(googleDriveUrl);
// }
@Get('verify-agent/:macAddress')
@ApiOperation({ summary: 'Verify if agent is installed and running by MAC address' })
async verifyAgent(
  @Param('macAddress') macAddress: string,
  @Res() res: Response
) {
  try {
    // Find host by MAC address in database
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

    // Build verification response
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

    // Determine status
    let status: string;
    if (host.agentInstalled && host.agentConnected) {
      status = 'fully_operational';
    } else if (host.agentInstalled && !host.agentConnected) {
      // Check if agent was recently seen (within last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (host.agentLastSeen && host.agentLastSeen > fiveMinutesAgo) {
        status = 'recently_disconnected';
      } else {
        status = 'installed_not_running';
      }
    } else {
      status = 'not_installed';
    }

    return res.json({
      success: true,
      status,
      ...verification,
    });

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message
    });
  }
}

@Get('download-installer')
@ApiOperation({ summary: 'Download macOS installer package' })
async downloadInstaller(@Req() req: Request, @Res() res: Response) {
  console.log('📍 __dirname:', __dirname);
  
  const pkgPath = join(__dirname, '..', '..', 'installers', 'RemoteAgent.pkg');
  console.log('📍 pkgPath:', pkgPath);
  console.log('📍 File exists?', existsSync(pkgPath));
  
  try {
    if (!existsSync(pkgPath)) {
      console.log('❌ File not found at:', pkgPath);
      return res.status(404).json({ 
        success: false, 
        message: 'Installer not found' 
      });
    }

    console.log('✅ File found, creating download log...');

    // Log the download


    const stats = fs.statSync(pkgPath);
    console.log('📦 File size:', stats.size);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="RemoteAgent.pkg"');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    
    console.log('📤 Starting file stream...');
    const fileStream = createReadStream(pkgPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('❌ Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      }
    });
    
  } catch (error) {
    console.error('❌ Download error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

}

  
