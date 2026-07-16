import { Body, Controller, Post } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { CreateRoomDto } from './dto/create-room.dto';
import type { RoomTokenResponseDto } from './dto/room-token-response.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @RequirePermission(PERMISSIONS.CALLS_CREATE)
  @Post('token')
  async createToken(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateRoomDto,
  ): Promise<RoomTokenResponseDto> {
    return this.roomsService.createRoomAndToken(principal.tenantId, dto);
  }
}
