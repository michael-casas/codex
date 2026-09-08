import type { AppServerInboundMessage } from '../app-server-client/app-server-client.types.js';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bounded(value: string): string {
  // This is an observation, never a truncated protocol message or model output.
  const bytes = Buffer.from(value);
  return new TextDecoder().decode(bytes.subarray(0, 4093), { stream: true });
}

function logicalItem(
  params: Record<string, unknown>,
  value: Record<string, unknown> & { body: string },
) {
  if (typeof params.threadId !== 'string' || typeof params.turnId !== 'string')
    return {};
  const originalBytes = Buffer.byteLength(value.body);
  const body = new TextDecoder().decode(
    Buffer.from(value.body).subarray(0, 65_536),
    { stream: true },
  );
  return {
    item: {
      ...value,
      threadId: params.threadId,
      turnId: params.turnId,
      body,
      originalBytes,
      truncated: originalBytes > Buffer.byteLength(body),
    },
  };
}

/** Allowlisted public activity only. Raw arguments, media and reasoning never escape. */
export function mapAppServerVisibility(
  message: AppServerInboundMessage,
  binding?: { readonly threadId: string; readonly turnId?: string },
): Record<string, unknown> | undefined {
  if (message.kind !== 'notification') return undefined;
  const params: Record<string, unknown> = {
    ...binding,
    ...record(message.params),
  };
  if (message.method === 'turn/completed') {
    const turn = record(params.turn);
    const rawStatus =
      typeof turn.status === 'string' ? turn.status.toLowerCase() : 'unknown';
    if (rawStatus === 'completed') return undefined;
    const status = ['failed', 'interrupted', 'cancelled'].includes(rawStatus)
      ? rawStatus
      : 'unknown';
    return {
      kind: 'turn.failed',
      status,
      detail: { type: 'status', body: `turn: ${status}` },
    };
  }
  const deltaType =
    message.method === 'item/agentMessage/delta'
      ? 'message'
      : message.method === 'item/commandExecution/outputDelta'
        ? 'command'
        : undefined;
  if (
    deltaType &&
    typeof params.itemId === 'string' &&
    typeof params.delta === 'string'
  ) {
    return {
      kind: `item.${deltaType}.delta`,
      itemId: params.itemId,
      detail: { type: deltaType, body: bounded(params.delta) },
      ...logicalItem(params, {
        itemId: params.itemId,
        itemType: deltaType === 'message' ? 'agentMessage' : 'commandExecution',
        operation: 'append',
        body: params.delta,
      }),
    };
  }
  if (!['item/started', 'item/completed'].includes(message.method))
    return undefined;
  const item = record(params.item);
  if (
    typeof item.id !== 'string' ||
    typeof item.type !== 'string' ||
    item.type === 'reasoning'
  )
    return undefined;
  const kind =
    message.method === 'item/completed' ? 'item.completed' : 'item.started';
  if (item.type === 'agentMessage' && typeof item.text === 'string') {
    return {
      kind,
      itemId: item.id,
      itemType: item.type,
      detail: { type: 'message', body: bounded(item.text) },
      ...logicalItem(params, {
        itemId: item.id,
        itemType: item.type,
        operation: kind === 'item.completed' ? 'replace' : 'append',
        messagePhase: item.phase ?? null,
        body: item.text,
      }),
    };
  }
  const itemType =
    item.type === 'Extension' && item.kind === 'image_gen.generation'
      ? 'imageGeneration'
      : item.type;
  if (
    ![
      'commandExecution',
      'fileChange',
      'mcpToolCall',
      'dynamicToolCall',
      'webSearch',
      'imageGeneration',
      'imageView',
      'contextCompaction',
    ].includes(itemType)
  )
    return undefined;
  const status =
    typeof item.status === 'string'
      ? bounded(item.status).slice(0, 64)
      : kind === 'item.completed'
        ? 'completed'
        : 'running';
  return {
    kind,
    itemId: item.id,
    itemType,
    detail: { type: 'tool', body: `${itemType}: ${status}` },
    ...logicalItem(params, {
      itemId: item.id,
      itemType,
      operation:
        typeof item.aggregatedOutput === 'string' && kind === 'item.completed'
          ? 'replace'
          : 'status',
      body:
        typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
      status,
    }),
  };
}
