export declare class SendCommandDto {
    hostId: string;
    command: string;
}
export declare class CommandResultDto {
    hostId: string;
    output: string;
    error?: string;
    exitCode?: number;
}
export declare class ListFilesDto {
    hostId: string;
    path: string;
}
export declare class DownloadFileDto {
    hostId: string;
    filePath: string;
}
export declare class UploadFileDto {
    hostId: string;
    destinationPath: string;
    contentBase64: string;
}
export declare class DeleteFileDto {
    hostId: string;
    filePath: string;
}
export declare class NetworkScanDto {
    hostId: string;
}
