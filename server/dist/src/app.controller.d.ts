import { AppService } from './app.service';
import { Response, Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
export declare class AppController {
    private readonly appService;
    private readonly prisma;
    constructor(appService: AppService, prisma: PrismaService);
    getHello(): string;
    getInstallAgentScript(res: Response): void;
    downloadAgentMac(res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    quickInstall(res: Response): Promise<void>;
    verifyAgent(macAddress: string, res: Response): Promise<Response<any, Record<string, any>>>;
    downloadInstaller(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
