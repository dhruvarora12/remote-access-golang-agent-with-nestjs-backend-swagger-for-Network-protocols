import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
export declare class AgentDownloadController {
    private prisma;
    constructor(prisma: PrismaService);
    downloadMacOS(res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    downloadWindows(res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    uninstallAgent(hostId: string, res: Response): Promise<Response<any, Record<string, any>>>;
    getUninstallScript(res: Response): Promise<void>;
}
