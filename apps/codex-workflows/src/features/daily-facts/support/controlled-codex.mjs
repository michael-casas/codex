#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const tracePath = process.env.CODEX_DAILY_FACTS_TEST_TRACE;
const writeTrace = (record) => {
  if (tracePath) appendFileSync(tracePath, `${JSON.stringify(record)}\n`);
};

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const args = process.argv.slice(2);
const slot = [1, 2, 3].find((candidate) =>
  input.includes(`__DAILY_FACTS_SLOT_${candidate}__`),
);
const values = {
  1: {
    industry: 'Artificial intelligence',
    topic: 'AI chip packaging capacity',
    summary:
      'Chipmakers and equipment suppliers are expanding advanced packaging capacity because AI accelerators increasingly depend on high-bandwidth memory and tightly integrated chiplets. The near-term contest is shifting toward yield, substrate supply, and dependable volume production.',
    articles: [
      {
        title: 'Packaging investment accelerates for AI chips',
        url: 'https://news.example/semiconductors/packaging-investment',
        publishedAt: '2026-08-10',
        publisher: 'Semiconductor News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Substrate suppliers prepare new capacity',
        url: 'https://wire.example/chips/substrate-capacity',
        publishedAt: '2026-08-10',
        publisher: 'Chip Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Packaging suppliers expand advanced production lines',
        url: 'https://news.example/semiconductors/advanced-production-lines',
        publishedAt: '2026-08-10',
        publisher: 'Semiconductor News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'AI accelerator makers secure chiplet capacity',
        url: 'https://wire.example/chips/accelerator-chiplet-capacity',
        publishedAt: '2026-08-10',
        publisher: 'Chip Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
    ],
  },
  2: {
    industry: 'Consumer applications',
    topic: 'App platform distribution policy',
    summary:
      'Consumer application publishers are adapting product and pricing plans as mobile platforms revise distribution rules and subscription tooling. The near-term contest centers on discovery, payment choice, and whether smaller developers can turn policy changes into durable improvements in reach and margins.',
    articles: [
      {
        title: 'App publishers revise mobile distribution plans',
        url: 'https://news.example/apps/mobile-distribution',
        publishedAt: '2026-08-10',
        publisher: 'App Economy News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Subscription platforms add new developer controls',
        url: 'https://wire.example/apps/subscription-controls',
        publishedAt: '2026-08-10',
        publisher: 'App Platform Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Mobile platforms expand application payment choice',
        url: 'https://news.example/apps/payment-choice',
        publishedAt: '2026-08-10',
        publisher: 'App Economy News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Developers gain new app discovery controls',
        url: 'https://wire.example/apps/discovery-controls',
        publishedAt: '2026-08-10',
        publisher: 'App Platform Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
    ],
  },
  3: {
    industry: 'Media and entertainment',
    topic: 'Streaming discovery and format expansion',
    summary:
      'Streaming and media platforms are expanding into new formats while using recommendation systems to compete for limited audience attention. Product teams are combining video, audio, games, and creator tools, making discovery quality and rights economics central to whether broader catalogs improve retention.',
    articles: [
      {
        title: 'Streaming platforms expand interactive discovery',
        url: 'https://news.example/media/streaming-discovery',
        publishedAt: '2026-08-10',
        publisher: 'Media News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Entertainment apps add new content formats',
        url: 'https://wire.example/media/content-formats',
        publishedAt: '2026-08-10',
        publisher: 'Streaming Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Media catalogs introduce broader creator formats',
        url: 'https://news.example/media/creator-formats',
        publishedAt: '2026-08-10',
        publisher: 'Media News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Streaming discovery tools improve audience retention',
        url: 'https://wire.example/media/audience-retention',
        publishedAt: '2026-08-10',
        publisher: 'Streaming Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
    ],
  },
};

writeTrace({ type: 'started', pid: process.pid, args, slot, atMs: Date.now() });
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
emit({ type: 'thread.started', thread_id: `daily-facts-slot-${slot ?? 0}` });
emit({ type: 'turn.started' });

// Keep the controlled turns open long enough for all three independently
// spawned SDK processes to publish their readiness records under aggregate load.
await new Promise((resolve) => setTimeout(resolve, 500));

if (!slot) {
  emit({ type: 'turn.failed', error: { message: 'missing daily-facts slot' } });
  writeTrace({ type: 'failed', pid: process.pid, atMs: Date.now() });
  process.exit(0);
}

const response = JSON.stringify({
  ...values[slot],
  asOfDate: '2026-08-10',
});
emit({
  type: 'item.completed',
  item: { id: `daily-facts-${slot}`, type: 'agent_message', text: response },
});
emit({
  type: 'turn.completed',
  usage: {
    input_tokens: 10,
    cached_input_tokens: 0,
    output_tokens: 40,
    reasoning_output_tokens: 8,
  },
});
writeTrace({ type: 'completed', pid: process.pid, slot, atMs: Date.now() });
