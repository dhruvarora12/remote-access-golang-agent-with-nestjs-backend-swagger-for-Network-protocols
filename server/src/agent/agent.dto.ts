import { ApiProperty } from '@nestjs/swagger';

export class SendCommandDto {
  @ApiProperty({ 
    description: 'Host ID from the connected agents list',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
  })
  hostId: string;

  @ApiProperty({ 
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
  })
  command: string;
}

export class CommandResultDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  hostId: string;

  @ApiProperty({ example: 'dhruvarora\n' })
  output: string;

  @ApiProperty({ required: false, example: '' })
  error?: string;

  @ApiProperty({ required: false, example: 0 })
  exitCode?: number;
}

export class ListFilesDto {
  @ApiProperty({ 
    description: 'Host ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
  })
  hostId: string;

  @ApiProperty({ 
    description: 'Path to list files from',
    example: '/Users/username/Desktop' 
  })
  path: string;
}

export class DownloadFileDto {
  @ApiProperty({ 
    description: 'Host ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
  })
  hostId: string;

  @ApiProperty({ 
    description: 'Full path to file',
    example: '/Users/username/Desktop/file.txt' 
  })
  filePath: string;
}

export class UploadFileDto {
  @ApiProperty({ 
    description: 'Host ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
  })
  hostId: string;

  @ApiProperty({ 
    description: 'Destination path on remote machine',
    example: '/Users/username/Desktop/uploaded.txt' 
  })
  destinationPath: string;

  @ApiProperty({ 
    description: 'Base64 encoded file content',
    example: 'SGVsbG8gV29ybGQh' 
  })
  contentBase64: string;
}

export class DeleteFileDto {
  @ApiProperty({ 
    description: 'Host ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
  })
  hostId: string;

  @ApiProperty({ 
    description: 'Full path to file/folder to delete',
    example: '/Users/username/Desktop/file.txt' 
  })
  filePath: string;
}

export class NetworkScanDto {
  @ApiProperty({ 
    description: 'Host ID to perform network scan',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' 
  })
  hostId: string;
}