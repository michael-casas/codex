# Codex thread wake prototype

This prototype waits for a configurable delay, resumes an existing local Codex
thread with `@openai/codex-sdk`, and starts a new turn with the supplied prompt.

```bash
node wake-thread.mjs \
  --thread-id "$CODEX_THREAD_ID" \
  --delay-seconds 120 \
  --prompt "Wake primitive fired. Confirm this thread resumed successfully, then stop."
```

The prototype resumes with a read-only sandbox and `approvalPolicy: "never"` so
the wake proof cannot modify the filesystem or pause on an approval dialog.
Launching it with `nohup` and redirected standard streams keeps it alive after
the launching shell exits.
