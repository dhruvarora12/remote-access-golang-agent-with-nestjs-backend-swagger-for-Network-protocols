import { AgentGateway } from './agent.gateway';
import { SendCommandDto, ListFilesDto, DownloadFileDto, UploadFileDto, DeleteFileDto, NetworkScanDto } from './agent.dto';
import { PrismaService } from '../../prisma/prisma.service';
export declare class AgentController {
    private readonly agentGateway;
    private readonly prisma;
    private readonly logger;
    constructor(agentGateway: AgentGateway, prisma: PrismaService);
    listAgents(): Promise<{
        count: number;
        connectedCount: number;
        hosts: string[];
        details: {
            hostId: string;
            hostname: string;
            ipAddress: string;
            macAddress: string | null;
            os: string | null;
            platform: string | null;
            agentConnected: boolean;
            agentLastSeen: Date | null;
            agentInstalledAt: Date | null;
            isOnline: boolean;
        }[];
    }>;
    sendCommand(body: SendCommandDto): Promise<{
        success: boolean;
        message: string;
    }>;
    getAgentInfo(hostId: string): Promise<{
        success: boolean;
        hostId: string;
        systemInfo: any;
        source: string;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        hostId: string;
        systemInfo?: undefined;
        source?: undefined;
    }>;
    getCommandHistory(hostId: string, limit?: number): Promise<{
        success: boolean;
        hostId: string;
        count: number;
        commands: {
            id: string;
            hostId: string;
            command: string;
            output: any;
            rawOutput: string;
            error: string | null;
            exitCode: number | null;
            status: string | null;
            executedAt: Date | null;
            completedAt: Date | null;
        }[];
    }>;
    listFiles(body: ListFilesDto): Promise<any>;
    downloadFile(body: DownloadFileDto): Promise<any>;
    uploadFile(body: UploadFileDto): Promise<any>;
    deleteFile(body: DeleteFileDto): Promise<any>;
    scanNetwork(body: NetworkScanDto): Promise<any>;
    private generateMockNetworkScan;
    mockNetworkScan(): Promise<{
        success: boolean;
        localIP: string;
        network: string;
        gateway: string;
        devices: any[];
        totalDevices: number;
        scanTime: string;
    }>;
}
