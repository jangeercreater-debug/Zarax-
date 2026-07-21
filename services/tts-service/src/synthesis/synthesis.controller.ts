import { Body, Controller, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalTokenGuard } from '@zarax/shared-auth';

import { CARTESIA_REST_CLIENT } from './synthesis.tokens';
import type { CartesiaRestClient } from '../cartesia/cartesia-rest.client';
import { SynthesizeDto } from './dto/synthesize.dto';

@UseGuards(InternalTokenGuard)
@Controller('synthesize')
export class SynthesisController {
  constructor(@Inject(CARTESIA_REST_CLIENT) private readonly cartesiaClient: CartesiaRestClient) {}

  @Post()
  async synthesize(@Body() dto: SynthesizeDto, @Res() res: Response): Promise<void> {
    const audio = await this.cartesiaClient.synthesize({
      text: dto.text,
      voiceId: dto.voiceId,
      modelId: dto.modelId,
    });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audio.length);
    res.end(audio);
  }
}
