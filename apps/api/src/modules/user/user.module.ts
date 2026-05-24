import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  controllers: [UserController, AccountDeletionController],
  providers: [AccountDeletionService],
  exports: [AccountDeletionService],
})
export class UserModule {}
