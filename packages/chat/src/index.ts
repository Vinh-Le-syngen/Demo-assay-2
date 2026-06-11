// @sys/chat — public API re-exports.

export { defineChat, chatConfigSchema, TURN_POLICIES, CONTENT_VERDICTS } from './config'
export type {
  ChatConfig,
  ChatConfigInput,
  TurnPolicy,
  ContentPolicy,
  ContentVerdict,
} from './config'

export {
  createChatSession,
  addMessage,
  closeSession,
  sessionSummary,
  MESSAGE_ROLES,
} from './core'
export type {
  ChatMessage,
  ChatSession,
  SessionStatus,
  SessionSummary,
  MessageRole,
  AddMessageResult,
} from './core'
