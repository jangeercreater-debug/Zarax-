import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InternalTokenGuard } from '@zarax/shared-auth';
import type { Express } from 'express';

import { DeepgramBatchService } from '../deepgram/deepgram-batch.service';
import type { TranscribeResponseDto } from './dto/transcribe-response.dto';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — generous for a single recorded message/voicemail

@UseGuards(InternalTokenGuard)
@Controller('transcribe')
export class TranscriptionController {
  constructor(private readonly deepgramBatchService: DeepgramBatchService) {}

  @Post()
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async transcribe(
    @UploadedFile() audio?: Express.Multer.File,
  ): Promise<TranscribeResponseDto> {
    if (!audio) {
      throw new BadRequestException("Missing 'audio' file in multipart form data.");
    }

    return this.deepgramBatchService.transcribeFile(audio.buffer, { mimetype: audio.mimetype });
  }
}
