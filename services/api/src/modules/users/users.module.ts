import { Module } from '@nestjs/common';

import { UsersAuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [UsersAuthModule], // re-uses its exported UserRepository provider
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
