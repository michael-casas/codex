import { Codex } from '@openai/codex-sdk';

import type {
  CodexAdapter,
  CodexAdapterThread,
  CodexEvent,
  CodexHostConfig,
  CodexThreadRequest,
  CodexUsage,
} from './types.js';

interface UnknownRecord {
  [key: string]: unknown;
}

function record(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null
    ? (value as UnknownRecord)
    : {};
}

function usage(value: unknown): CodexUsage | undefined {
  const source = record(value);
  if (typeof source.input_tokens !== 'number') return undefined;
  return {
    inputTokens: source.input_tokens,
    cachedInputTokens: Number(source.cached_input_tokens ?? 0),
    cacheWriteInputTokens: Number(source.cache_write_input_tokens ?? 0),
    outputTokens: Number(source.output_tokens ?? 0),
    reasoningOutputTokens: Number(source.reasoning_output_tokens ?? 0),
  };
}

function mapEvent(value: unknown): CodexEvent {
  const source = record(value);
  const event: CodexEvent = { type: String(source.type) as CodexEvent['type'] };
  if (typeof source.thread_id === 'string') event.threadId = source.thread_id;
  const sourceItem = record(source.item);
  if (
    typeof sourceItem.id === 'string' &&
    typeof sourceItem.type === 'string'
  ) {
    event.item = {
      id: sourceItem.id,
      type: sourceItem.type,
      ...(typeof sourceItem.text === 'string' ? { text: sourceItem.text } : {}),
      ...(typeof sourceItem.command === 'string'
        ? { command: sourceItem.command }
        : {}),
      ...(typeof sourceItem.status === 'string'
        ? { status: sourceItem.status }
        : {}),
      ...(typeof sourceItem.exit_code === 'number'
        ? { exitCode: sourceItem.exit_code }
        : {}),
    };
  }
  const mappedUsage = usage(source.usage);
  if (mappedUsage) event.usage = mappedUsage;
  const sourceError = record(source.error);
  if (typeof source.message === 'string') event.error = source.message;
  else if (typeof sourceError.message === 'string')
    event.error = sourceError.message;
  return event;
}

function threadOptions(request: CodexThreadRequest) {
  return {
    model: request.model,
    sandboxMode: request.sandbox,
    workingDirectory: request.workingDirectory,
    skipGitRepoCheck: request.skipGitRepoCheck,
    modelReasoningEffort: request.reasoningEffort,
    networkAccessEnabled: request.networkAccessEnabled,
    webSearchMode: request.webSearch,
    approvalPolicy: request.approval,
    additionalDirectories: request.additionalDirectories,
  };
}

function adaptThread(
  sdkThread: ReturnType<Codex['startThread']>,
): CodexAdapterThread {
  return {
    get id() {
      return sdkThread.id;
    },
    async run(request) {
      const events: CodexEvent[] = [];
      let finalResponse = '';
      let mappedUsage: CodexUsage | null = null;
      const streamed = await sdkThread.runStreamed(request.prompt, {
        outputSchema: request.outputSchema,
        signal: request.signal,
      });
      for await (const rawEvent of streamed.events) {
        const event = mapEvent(rawEvent);
        events.push(event);
        if (
          event.type === 'item.completed' &&
          event.item?.type === 'agent_message'
        ) {
          finalResponse = event.item.text ?? '';
        }
        if (event.type === 'turn.completed') mappedUsage = event.usage ?? null;
        if (event.type === 'turn.failed' || event.type === 'error') {
          throw new Error(event.error ?? 'Codex turn failed');
        }
      }
      const threadId = sdkThread.id;
      if (!threadId) throw new Error('Codex did not emit a thread identifier');
      return { threadId, finalResponse, events, usage: mappedUsage };
    },
    async *stream(request) {
      const streamed = await sdkThread.runStreamed(request.prompt, {
        outputSchema: request.outputSchema,
        signal: request.signal,
      });
      for await (const rawEvent of streamed.events) yield mapEvent(rawEvent);
    },
  };
}

export function createCodexSdkAdapter(config: CodexHostConfig): CodexAdapter {
  const sdk = new Codex({
    codexPathOverride: config.codexPathOverride,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    config: config.config,
    env: config.env,
  });
  return {
    startThread(request) {
      return adaptThread(sdk.startThread(threadOptions(request)));
    },
    resumeThread(threadId, request) {
      return adaptThread(sdk.resumeThread(threadId, threadOptions(request)));
    },
  };
}
