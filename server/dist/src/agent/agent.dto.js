"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkScanDto = exports.DeleteFileDto = exports.UploadFileDto = exports.DownloadFileDto = exports.ListFilesDto = exports.CommandResultDto = exports.SendCommandDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SendCommandDto {
    hostId;
    command;
}
exports.SendCommandDto = SendCommandDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Host ID from the connected agents list',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    }),
    __metadata("design:type", String)
], SendCommandDto.prototype, "hostId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Shell command to execute on the remote agent',
        example: 'ls -la',
        examples: {
            'whoami': {
                value: 'whoami',
                description: 'Get current username'
            },
            'pwd': {
                value: 'pwd',
                description: 'Get current directory'
            },
            'ls': {
                value: 'ls -la',
                description: 'List all files'
            }
        }
    }),
    __metadata("design:type", String)
], SendCommandDto.prototype, "command", void 0);
class CommandResultDto {
    hostId;
    output;
    error;
    exitCode;
}
exports.CommandResultDto = CommandResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
    __metadata("design:type", String)
], CommandResultDto.prototype, "hostId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'dhruvarora\n' }),
    __metadata("design:type", String)
], CommandResultDto.prototype, "output", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, example: '' }),
    __metadata("design:type", String)
], CommandResultDto.prototype, "error", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, example: 0 }),
    __metadata("design:type", Number)
], CommandResultDto.prototype, "exitCode", void 0);
class ListFilesDto {
    hostId;
    path;
}
exports.ListFilesDto = ListFilesDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Host ID',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    }),
    __metadata("design:type", String)
], ListFilesDto.prototype, "hostId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Path to list files from',
        example: '/Users/username/Desktop'
    }),
    __metadata("design:type", String)
], ListFilesDto.prototype, "path", void 0);
class DownloadFileDto {
    hostId;
    filePath;
}
exports.DownloadFileDto = DownloadFileDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Host ID',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    }),
    __metadata("design:type", String)
], DownloadFileDto.prototype, "hostId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Full path to file',
        example: '/Users/username/Desktop/file.txt'
    }),
    __metadata("design:type", String)
], DownloadFileDto.prototype, "filePath", void 0);
class UploadFileDto {
    hostId;
    destinationPath;
    contentBase64;
}
exports.UploadFileDto = UploadFileDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Host ID',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    }),
    __metadata("design:type", String)
], UploadFileDto.prototype, "hostId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Destination path on remote machine',
        example: '/Users/username/Desktop/uploaded.txt'
    }),
    __metadata("design:type", String)
], UploadFileDto.prototype, "destinationPath", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Base64 encoded file content',
        example: 'SGVsbG8gV29ybGQh'
    }),
    __metadata("design:type", String)
], UploadFileDto.prototype, "contentBase64", void 0);
class DeleteFileDto {
    hostId;
    filePath;
}
exports.DeleteFileDto = DeleteFileDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Host ID',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    }),
    __metadata("design:type", String)
], DeleteFileDto.prototype, "hostId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Full path to file/folder to delete',
        example: '/Users/username/Desktop/file.txt'
    }),
    __metadata("design:type", String)
], DeleteFileDto.prototype, "filePath", void 0);
class NetworkScanDto {
    hostId;
}
exports.NetworkScanDto = NetworkScanDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Host ID to perform network scan',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    }),
    __metadata("design:type", String)
], NetworkScanDto.prototype, "hostId", void 0);
//# sourceMappingURL=agent.dto.js.map