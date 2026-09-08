const answer = {
  title: 'Synthetic launch',
  status: 'ready',
  notes: 'Checks passed',
  count: 0,
  enabled: false,
};
export const readableTitle =
  'Market launch review — ' + 'Long campaign title '.repeat(12).trim();

const params = (id, thread) => ({ threadId: id, turnId: thread.turnId });
function item(id, thread, emit, itemId, text, phase = 'commentary') {
  emit(thread.peer, 'item/completed', {
    ...params(id, thread),
    completedAtMs: Date.now(),
    item: {
      id: itemId,
      type: 'agentMessage',
      text,
      phase,
      memoryCitation: null,
      delivery: null,
    },
  });
}
export function startReadableTurn(id, thread, input, emit) {
  thread.readableRole = input.includes('R2 Writer') ? 'writer' : 'companion';
  if (thread.readableRole !== 'writer') return;
  emit(thread.peer, 'item/started', {
    ...params(id, thread),
    startedAtMs: Date.now(),
    item: {
      id: 'writer-message',
      type: 'agentMessage',
      text: '',
      phase: 'commentary',
      memoryCitation: null,
      delivery: null,
    },
  });
  for (let index = 0; index < 110; index++) {
    emit(thread.peer, 'item/agentMessage/delta', {
      ...params(id, thread),
      itemId: 'writer-message',
      delta: index === 0 ? 'Draft **update**: ' : 'small chunk ',
    });
  }
}
export function completeReadableTurn(id, thread, emit) {
  if (thread.done) return;
  thread.done = true;
  const text =
    thread.readableRole === 'writer'
      ? JSON.stringify(answer)
      : 'Companion finished';
  thread.finalText = text;
  item(id, thread, emit, thread.readableRole + '-result', text, 'final_answer');
  emit(thread.peer, 'turn/completed', {
    threadId: id,
    turn: { id: thread.turnId, status: 'completed' },
  });
}
export function handleReadableControl(command, threads, emit) {
  const found = [...threads].find(
    ([, thread]) => thread.readableRole === 'writer',
  );
  if (!found) throw Error('READABLE_WRITER_MISSING');
  const [id, thread] = found;
  if (command.action === 'finalize-message') {
    item(
      id,
      thread,
      emit,
      'writer-message',
      '**Final update** with `safeCode` and a corrected ending.\n\n<script>window.__r2Unsafe = true</script>\n\n[unsafe](javascript:alert(1)) ![remote](https://example.invalid/r2-tracker.png)',
    );
    const tool = {
      id: 'writer-command',
      type: 'commandExecution',
      command: 'synthetic check',
      cwd: '[synthetic]',
      status: 'inProgress',
      commandActions: [],
      aggregatedOutput: null,
      exitCode: null,
      durationMs: null,
    };
    emit(thread.peer, 'item/started', {
      ...params(id, thread),
      startedAtMs: Date.now(),
      item: tool,
    });
    emit(thread.peer, 'item/commandExecution/outputDelta', {
      ...params(id, thread),
      itemId: tool.id,
      delta: 'Synthetic check passed\n',
    });
    emit(thread.peer, 'item/completed', {
      ...params(id, thread),
      completedAtMs: Date.now(),
      item: {
        ...tool,
        status: 'completed',
        aggregatedOutput: 'Synthetic check passed\n',
        exitCode: 0,
        durationMs: 1,
      },
    });
  } else if (command.action === 'long-feed') {
    for (let index = 0; index < 24; index++)
      item(
        id,
        thread,
        emit,
        'history-' + index,
        `History ${index}: ` +
          'A readable paragraph for scroll anchoring. '.repeat(12),
      );
    item(
      id,
      thread,
      emit,
      'wide-code',
      '```text\n' + 'x'.repeat(900) + '\n```',
    );
  } else if (command.action === 'append-feed') {
    item(
      id,
      thread,
      emit,
      'new-content',
      'Newest activity after the reader scrolled up.',
    );
  } else if (
    command.action === 'append-probe' &&
    process.argv.includes('--performance')
  ) {
    if (
      !Number.isInteger(command.index) ||
      command.index < 0 ||
      command.index >= 40 ||
      command.index !== (thread.probeIndex ?? 0)
    )
      throw Error('READABLE_PROBE_INVALID');
    thread.probeIndex = command.index + 1;
    emit(thread.peer, 'item/agentMessage/delta', {
      ...params(id, thread),
      itemId: 'writer-message',
      delta: ` Probe-${String(command.index).padStart(2, '0')}.`,
    });
  } else if (command.action === 'complete-writer')
    completeReadableTurn(id, thread, emit);
  else if (command.action === 'unknown')
    emit(thread.peer, 'thread/status/changed', {
      threadId: id,
      status: { type: 'notLoaded' },
    });
  else throw Error('READABLE_ACTION_INVALID');
}
