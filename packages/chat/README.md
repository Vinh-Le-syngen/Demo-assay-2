# @sys/chat

Chat session manager — a reusable, host-agnostic subsystem for managing chat session
lifecycle, turn ordering, and content policy enforcement.

## Plane: Control

Owns the **Control** plane — manages session lifecycle and turn-ordering decisions.
Content filtering (Governance) and storage (Data) are **injected seams**; the host
supplies its own implementations.

## API

```ts
import { defineChat, createChatSession, addMessage, closeSession, sessionSummary } from '@sys/chat'

// 1. Configure
const config = defineChat({
  maxTurns: 100,
  turnPolicy: 'strict-alternation',
})

// 2. Create a session
const session = createChatSession(config, { sessionId: 'abc', userId: 'u1' })

// 3. Add messages (enforces turn policy + content policy)
const s1 = addMessage(session, { role: 'user', content: 'Hello' })
const s2 = addMessage(s1, { role: 'assistant', content: 'Hi there!' })

// 4. Summarize or close
const stats = sessionSummary(s2)
const closed = closeSession(s2)
```

## Injected seams

| Seam | Plane | What the host supplies |
|---|---|---|
| `ContentPolicy` | Governance | `filter(msg) → allow/deny/redact` — the host's moderation logic |

## Architecture

Pure functions, zero side-effects. Storage, transport, and moderation are the host's
concern. The package owns only the session model and decision logic.
