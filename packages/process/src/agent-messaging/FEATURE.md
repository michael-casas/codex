# Durable agent intercom

**Green Contract:** `CAS-05-GC-1`

## Rules

- `send`, `ask`, and `reply` each perform one authorized durable submission and return one stable message/correlation handle.
- PostgreSQL commits the message and outbox together; pg-boss alone owns delivery timing and retry.
- Exact idempotent replay returns the original handle. Conflicting reuse and invalid or unauthorized input produce no write.
- App Server acceptance, thread observation, and semantic reply are separate durable states.
- Active compatible turns use `turn/steer` with `expectedTurnId`; idle threads use `turn/start`.
- Ambiguous acceptance is reconciled by the stable client message marker before another delivery is legal.
- Public handles and delivery events never expose message bodies, credentials, raw reasoning, or provider choreography.

## Canonical behavior

The physical behavior source is [agent-messaging.feature](agent-messaging.feature).

## Stop boundary

The Worker stops at `READY-FOR-AUDIT`; fresh verification and judgment remain independent.
