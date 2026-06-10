# `@sys/chat` Specification

`@sys/chat` is the canonical session manager for conversational flows.

## Responsibilities
- **Primary Plane**: Control (owns the session lifecycle).
- **Secondary Planes**: Governance (injected content policy).

## Core Concepts

### Session Management
The package maintains the state of a chat session, managing the append-only log of messages. A session will automatically close if it exceeds the configured `maxTurns`.

### Turn Policies
The ordering of turns is governed by the `TurnPolicy`.
- `strict-alternation`: Enforces that `user` and `assistant` roles alternate (no consecutive turns by the same role).
- `free-form`: Allows any role to send a message at any time.

### Injected Seam: `ContentPolicy`
`@sys/chat` delegates content moderation to the host application via the `ContentPolicy` seam. The host supplies a filter that returns a `ContentVerdict`:
- `allow`: The message is safe.
- `deny`: The message is rejected entirely.
- `redact`: The message is permitted, but its content is replaced with a safe version.
