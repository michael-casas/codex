#!/usr/bin/env node

import { Codex } from "@openai/codex-sdk";

function parseArguments(argv) {
  const options = {
    delaySeconds: 120,
    threadId: process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID ?? "",
    prompt: "Wake primitive fired. Confirm this thread resumed successfully, then stop.",
    workingDirectory: process.cwd(),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${argument}`);
    }

    switch (argument) {
      case "--delay-seconds":
        options.delaySeconds = Number(value);
        break;
      case "--thread-id":
        options.threadId = value;
        break;
      case "--prompt":
        options.prompt = value;
        break;
      case "--working-directory":
        options.workingDirectory = value;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }

    index += 1;
  }

  if (!options.threadId) {
    throw new Error("No thread ID supplied and CODEX_THREAD_ID is not set");
  }
  if (!Number.isFinite(options.delaySeconds) || options.delaySeconds < 0) {
    throw new Error("--delay-seconds must be a non-negative number");
  }

  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const wakeAt = new Date(Date.now() + options.delaySeconds * 1_000);

  console.log(
    JSON.stringify({
      event: "wake.scheduled",
      threadId: options.threadId,
      delaySeconds: options.delaySeconds,
      wakeAt: wakeAt.toISOString(),
      dryRun: options.dryRun,
    }),
  );

  if (options.dryRun) {
    return;
  }

  await sleep(options.delaySeconds * 1_000);
  console.log(
    JSON.stringify({
      event: "wake.firing",
      threadId: options.threadId,
      firedAt: new Date().toISOString(),
    }),
  );

  const codex = new Codex();
  const thread = codex.resumeThread(options.threadId, {
    workingDirectory: options.workingDirectory,
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    approvalPolicy: "never",
  });
  const turn = await thread.run(options.prompt);

  console.log(
    JSON.stringify({
      event: "wake.completed",
      threadId: options.threadId,
      completedAt: new Date().toISOString(),
      finalResponse: turn.finalResponse,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "wake.failed",
      failedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
