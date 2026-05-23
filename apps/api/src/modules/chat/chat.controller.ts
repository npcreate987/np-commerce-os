import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminReplyChatInput,
  adminReplyChatInputSchema,
  ChatbotConfig,
  ChatConversation,
  ChatMessage,
  HandoffStatus,
  SendChatMessageInput,
  SendChatMessageResult,
  sendChatMessageInputSchema,
} from '../../shared/types';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

/**
 * Phase 9.3 — `/v1/chat/*` endpoints.
 *
 * Customer surface:
 *   - GET  /chat/config
 *   - GET  /chat/conversations              (mine)
 *   - GET  /chat/conversations/active       (or create)
 *   - GET  /chat/conversations/:id/messages
 *   - POST /chat/messages                   (send)
 *
 * Admin surface (role=ADMIN):
 *   - GET   /chat/admin/conversations
 *   - GET   /chat/admin/conversations/:id/messages
 *   - POST  /chat/admin/reply
 *   - PATCH /chat/admin/conversations/:id/take-over
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // ---- Public config ----
  @Get('config')
  config(): ChatbotConfig {
    return this.chat.getConfig();
  }

  // ---- Customer ----
  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<ChatConversation[]> {
    return this.chat.listMyConversations(user.userId);
  }

  @Get('conversations/active')
  @UseGuards(JwtAuthGuard)
  active(@CurrentUser() user: AuthenticatedUser): Promise<ChatConversation> {
    return this.chat.getOrCreateActive(user.userId);
  }

  @Get('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ChatMessage[]> {
    return this.chat.listMessages(user.userId, id);
  }

  @Post('messages')
  @UseGuards(JwtAuthGuard)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendChatMessageInputSchema))
    input: SendChatMessageInput,
  ): Promise<SendChatMessageResult> {
    return this.chat.send(user.userId, input);
  }

  // ---- Admin ----
  @Get('admin/conversations')
  @UseGuards(JwtAuthGuard)
  adminList(
    @CurrentUser() user: AuthenticatedUser,
    @Query('handoff') handoff?: string,
    @Query('limit') limit?: string,
  ): Promise<ChatConversation[]> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    const h = (handoff as HandoffStatus | 'ALL' | undefined) ?? 'ALL';
    return this.chat.adminList({
      handoff: h,
      limit: limit ? Math.max(1, Math.min(200, Number(limit))) : undefined,
    });
  }

  @Get('admin/conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  adminMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ChatMessage[]> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    return this.chat.adminMessages(id);
  }

  @Post('admin/reply')
  @UseGuards(JwtAuthGuard)
  adminReply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(adminReplyChatInputSchema))
    input: AdminReplyChatInput,
  ): Promise<ChatMessage> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    return this.chat.adminReply(user.userId, input);
  }

  @Patch('admin/conversations/:id/take-over')
  @UseGuards(JwtAuthGuard)
  adminTakeOver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ChatConversation> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    return this.chat.adminTakeOver(user.userId, id);
  }
}
