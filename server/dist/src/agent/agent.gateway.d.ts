import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
export declare class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private prisma;
    server: Server;
    private logger;
    private agents;
    private socketToHostId;
    private ipToHostId;
    private commandResults;
    private agentSystemInfo;
    constructor(prisma: PrismaService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): Promise<void>;
    private extractSystemInfo;
    handleRegister(client: Socket, data: any): Promise<{
        event: string;
        data: {
            hostId: any;
            message: string;
        };
    } | undefined>;
    handleCommandResult(client: Socket, data: any): Promise<{
        event: string;
        data: string;
    }>;
    sendCommandToAgent(hostId: string, command: string): Promise<boolean>;
    getConnectedAgents(): string[];
    getCommandResult(hostId: string, deleteAfterRead?: boolean): any;
    getAgentSystemInfo(hostId: string): any;
    getAgentFromDB(hostId: string): Promise<({
        commands: {
            error: string | null;
            id: string;
            status: string | null;
            createdAt: Date | null;
            hostId: string;
            command: string;
            args: string | null;
            rawOutput: string | null;
            parsedOutput: import("@prisma/client/runtime/library").JsonValue | null;
            exitCode: number | null;
            executedAt: Date | null;
            completedAt: Date | null;
        }[];
    } & {
        macAddress: string | null;
        id: string;
        hostName: string;
        ipAddress: string;
        monitoringPeriodId: string | null;
        vendorId: string | null;
        monitoringInstanceId: string | null;
        status: import("@prisma/client").$Enums.HostStatus;
        createdAt: Date;
        updatedAt: Date;
        vendorName: string | null;
        hostGroupId: string | null;
        city: string | null;
        country: string | null;
        criticality: string | null;
        latitude: string;
        longitude: string;
        model: string | null;
        parentId: string | null;
        protocol: string | null;
        remarks: string | null;
        state: string | null;
        tag: string | null;
        businessId: string | null;
        siteId: string | null;
        hostType: import("@prisma/client").$Enums.HostType;
        socketId: string | null;
        os: string | null;
        arch: string | null;
        platform: string | null;
        cpuInfo: import("@prisma/client/runtime/library").JsonValue | null;
        memoryInfo: import("@prisma/client/runtime/library").JsonValue | null;
        diskInfo: import("@prisma/client/runtime/library").JsonValue | null;
        systemInfo: import("@prisma/client/runtime/library").JsonValue | null;
        agentInstalled: boolean;
        agentConnected: boolean;
        agentLastSeen: Date | null;
        agentInstalledAt: Date | null;
        agentVersion: string | null;
    }) | null>;
    getCommandHistory(hostId: string, limit?: number): Promise<{
        error: string | null;
        id: string;
        status: string | null;
        createdAt: Date | null;
        hostId: string;
        command: string;
        args: string | null;
        rawOutput: string | null;
        parsedOutput: import("@prisma/client/runtime/library").JsonValue | null;
        exitCode: number | null;
        executedAt: Date | null;
        completedAt: Date | null;
    }[]>;
    private parseCommandOutput;
    private parseIfconfig;
    private parseLs;
    handleTestCommand(client: Socket, data: any): {
        event: string;
        data: string;
    };
}
