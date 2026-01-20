import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentGateway } from './agent/agent.gateway';
import { AgentController } from './agent/agent.controller';
import { AgentDownloadController } from './agent/agent-download.controller'; // ✅ ADD THIS
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppController, AgentController, AgentDownloadController], // ✅ ADD HERE
  providers: [AppService, AgentGateway],
})
export class AppModule {}