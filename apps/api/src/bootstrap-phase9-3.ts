/**
 * Phase 9.3 runtime migration — CS Chatbot (Conversational Support)
 *
 * Tables:
 *   - chat_conversations    (1 user can have many; one "active" at a time)
 *   - chat_messages         (user / assistant / tool / system roles)
 *
 * No new tool table — tool calls are encoded inline on the message row
 * (role='tool', toolName, toolArgs JSON, toolResult JSON). Cheap audit, and
 * the LLM history replay just reads the table in order.
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'OPEN',
    handoffStatus TEXT NOT NULL DEFAULT 'BOT',
    lastMessageAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unreadByAdmin INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_conv_user
    ON chat_conversations(userId, lastMessageAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_conv_handoff
    ON chat_conversations(handoffStatus, unreadByAdmin, lastMessageAt DESC)`,

  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    intent TEXT,
    toolName TEXT,
    toolArgs TEXT,
    toolResult TEXT,
    suggestedActionsJson TEXT NOT NULL DEFAULT '[]',
    durationMs INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_msg_conv
    ON chat_messages(conversationId, createdAt)`,
];

export async function runPhase9_3Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase9-3] migration complete');
}
