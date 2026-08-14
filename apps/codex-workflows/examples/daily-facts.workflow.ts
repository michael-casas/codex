#!/usr/bin/env -S codex-workflows
import { createHash, randomBytes } from 'node:crypto';

import {
  agent,
  artifact,
  defineWorkflow,
  parallel,
  WorkflowExecutionError,
} from '@codex/workflows';

import {
  renderDailyFacts,
  validateDailyFacts,
  verifyDailyFactSources,
  type DailyFact,
} from '../src/features/daily-facts/support/contract.js';

interface DailyFactsInput {
  utcTimestamp: string;
  selectionSeed?: string;
}

interface ResearchAssignment {
  slot: 1 | 2 | 3;
  industryCandidates: readonly string[];
  currentUtcDate: string;
  windowStartUtcDate: string;
  selectionSeed: string;
}

const industryBuckets = [
  [
    'Artificial intelligence',
    'Robotics',
    'Cybersecurity',
    'Semiconductors',
    'Cloud computing',
    'Data centers',
  ],
  [
    'Consumer applications',
    'Mobile software',
    'Social media',
    'Enterprise software',
    'Developer tools',
    'E-commerce',
  ],
  [
    'Media and entertainment',
    'Streaming media',
    'Video gaming',
    'Digital design',
    'Consumer electronics',
    'Creative software',
  ],
] as const;

const articleSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'url',
    'publishedAt',
    'publisher',
    'publicationDateEvidence',
  ],
  properties: {
    title: { type: 'string', minLength: 8, maxLength: 200 },
    url: {
      type: 'string',
      minLength: 12,
      maxLength: 2048,
      pattern: '^https://[^/]+/[^/?#]+/[^/?#]+',
    },
    publishedAt: { type: 'string', minLength: 10, maxLength: 10 },
    publisher: { type: 'string', minLength: 2, maxLength: 100 },
    publicationDateEvidence: {
      type: 'string',
      minLength: 8,
      maxLength: 100,
      pattern: '^20\\d{2}-\\d{2}-\\d{2}: .+',
    },
  },
} as const;

const dailyFactSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['industry', 'topic', 'asOfDate', 'summary', 'articles'],
  properties: {
    industry: { type: 'string', minLength: 3, maxLength: 80 },
    topic: { type: 'string', minLength: 3, maxLength: 120 },
    asOfDate: { type: 'string', minLength: 10, maxLength: 10 },
    summary: { type: 'string', minLength: 120, maxLength: 900 },
    articles: {
      type: 'array',
      minItems: 4,
      maxItems: 5,
      items: articleSchema,
    },
  },
} as const;

function sevenDayWindowDates(currentUtcDate: string): readonly string[] {
  const current = Date.parse(`${currentUtcDate}T00:00:00.000Z`);
  return Array.from({ length: 8 }, (_unused, ageInDays) =>
    new Date(current - ageInDays * 86_400_000).toISOString().slice(0, 10),
  );
}

function schemaFor(assignment: ResearchAssignment) {
  return {
    ...dailyFactSchema,
    properties: {
      ...dailyFactSchema.properties,
      industry: {
        type: 'string',
        enum: assignment.industryCandidates,
      },
      asOfDate: {
        type: 'string',
        enum: [assignment.currentUtcDate],
      },
      articles: {
        ...dailyFactSchema.properties.articles,
        items: {
          ...articleSchema,
          properties: {
            ...articleSchema.properties,
            publishedAt: {
              type: 'string',
              enum: sevenDayWindowDates(assignment.currentUtcDate),
            },
          },
        },
      },
    },
  } as const;
}

function validTimestamp(timestamp: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    timestamp,
  );
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  );
}

function dateFromTimestamp(timestamp: string): string {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

function sevenDayWindowStart(currentUtcDate: string): string {
  const date = new Date(`${currentUtcDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function randomizedCandidates(
  seed: string,
  slot: 1 | 2 | 3,
): readonly string[] {
  return [...industryBuckets[slot - 1]].sort((left, right) =>
    createHash('sha256')
      .update(`${seed}:${slot}:${left}`)
      .digest('hex')
      .localeCompare(
        createHash('sha256').update(`${seed}:${slot}:${right}`).digest('hex'),
      ),
  );
}

function promptFor(assignment: ResearchAssignment): string {
  return `__DAILY_FACTS_SLOT_${assignment.slot}__
Research current daily news as of ${assignment.currentUtcDate} UTC using live web search. Qualifying article/topic material may be published on any UTC calendar date from ${assignment.windowStartUtcDate} through ${assignment.currentUtcDate}, inclusive. Your randomized industry candidates, in order, are: ${assignment.industryCandidates.map((industry) => JSON.stringify(industry)).join(', ')}.

Try the candidates in that randomized order and select the first industry for which you can verify at least four qualifying articles or press releases from that seven-day UTC window. Move to the next candidate immediately if a search does not expose enough qualifying sources; never return placeholders. Choose one specific current topic materially affecting the selected industry. Return only the schema-bound JSON object. The industry field must exactly equal one listed candidate. The asOfDate must be exactly ${assignment.currentUtcDate}; each article publishedAt must be the article page's actual ISO date within ${assignment.windowStartUtcDate} through ${assignment.currentUtcDate}. Write a short substantive two-to-four sentence summary, then cite four to five qualifying reserve articles using their actual titles and direct HTTPS publisher links. The host independently ordinary-GET verifies these reserves and publishes the first two whose page title and authoritative date pass, so all four candidates must support the same topic.

The runtime rejects fallback language such as "no qualifying", "unable to verify", or "no sources" in the topic, summary, or article titles. It also rejects category, tag, archive, and bare /YYYY/MM/DD index URLs. Never manufacture a fallback object to satisfy the schema. Continue through the randomized candidates and source clusters until one coherent topic has at least two opened, verified, direct article pages.

Copy each direct article URL from the browser address bar after the final page loads. Remove invisible or zero-width formatting characters and do not append citation markers, punctuation, or encoded invisible bytes to the URL. Re-open the exact final URL you will return and confirm that ordinary GET reaches the article rather than a 404 or redirect to an index.

For slot ${assignment.slot}, search these compatible source clusters first: ${assignment.slot === 1 ? "arxiv.org, TechCrunch, Ars Technica, Tom's Hardware, NVIDIA Newsroom, Intel Newsroom, AMD, Google Cloud, AWS, and Microsoft News" : assignment.slot === 2 ? 'TechCrunch, The Verge, Engadget, 9to5Mac, MacRumors, GitHub Blog, Apple Newsroom, Meta Newsroom, and Spotify Newsroom' : 'TechRadar, Creative Bloq, GamesIndustry.biz, Eurogamer, Polygon, Rock Paper Shotgun, Xbox Wire, and PlayStation Blog'}. If one candidate has not yielded four qualifying direct pages within four focused searches, move to the next candidate. Once four fully verified sources support one coherent topic, stop searching and return immediately.

Begin the first search immediately; do not narrate a plan. Current-day high-throughput publisher archives and category pages can be used for discovery, but every final URL must be a direct article page. Keep the investigation bounded to at most fifteen searches and eighteen page opens, discard blocked or ambiguous pages immediately, and return the best two or three fully verified sources within five minutes.

For every article, provide the publisher name and set publicationDateEvidence to the exact format "<publishedAt>: <visible page date text>". The leading ISO date must byte-for-byte equal that article's publishedAt value; after the colon, copy the page's visible qualifying publication-date text. Example: "${assignment.currentUtcDate}: August 10, 2026". The visible text must explicitly contain the calendar month/day and four-digit year; a relative phrase such as "49 mins ago" is never sufficient. Before admitting any reserve, perform an ordinary unauthenticated GET of its exact final URL and confirm the returned 2xx HTML itself contains the qualifying date text or matching authoritative publication metadata; browser-rendered text, search snippets, and agent inference do not count. Reject the reserve immediately when that ordinary GET body does not prove its date, even if the article otherwise looks current. Open and verify each final page before returning it. Every headline must directly support the one chosen topic, and at least one meaningful five-or-more-letter word from each headline must appear verbatim in the industry, topic, or summary. Discard a candidate article if its actual headline has no such word. Immediately before returning JSON, perform this exact check article by article and copy the matching headline word unchanged into the topic or summary if it is not already present.

Prefer this ordinary-GET-compatible source set: arxiv.org, techcrunch.com, arstechnica.com, theverge.com, techradar.com, creativebloq.com, tomshardware.com, engadget.com, 9to5mac.com, macrumors.com, gamesindustry.biz, eurogamer.net, polygon.com, rockpapershotgun.com, github.blog, anthropic.com, blog.google, cloud.google.com, aws.amazon.com, news.microsoft.com, nvidianews.nvidia.com, newsroom.intel.com, amd.com, apple.com/newsroom, about.fb.com, newsroom.spotify.com, news.xbox.com, or blog.playstation.com. Another reputable publisher may qualify only when its direct article page meets the same ordinary-GET, title, visible-date, recency, and topic checks; a search cache never qualifies it. Do not use Netflix Tudum or Android Authority in final citations: Founder verification found their live date/title or URL stability unsuitable for this proof. Use a direct article, research-paper abstract, press release, or newsroom story page. Its URL path must have at least two nonempty segments and its final segment must not be index, results, documents, investors, news, press, or search. The final HTML page must return a successful 2xx response to an ordinary unauthenticated HTTP GET. Discard paywalled, login-only, bot-blocked, or access-denied sources. Never cite Reddit, social media, a forum, sponsored user content, a search result, a news or investor index, a home page, an article outside the stated seven-day window, an example domain, or an invented URL.`;
}

export default defineWorkflow<DailyFactsInput, unknown>({
  id: 'founder-daily-facts',
  version: 1,
  description:
    'Three parallel Luna researchers publish current UTC daily-news industry briefs.',
  maxConcurrency: 3,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['utcTimestamp'],
    properties: {
      utcTimestamp: {
        type: 'string',
        pattern: '^\\d{8}T\\d{6}Z$',
      },
      selectionSeed: { type: 'string', minLength: 8, maxLength: 128 },
    },
  },
  async run(input) {
    if (!validTimestamp(input.utcTimestamp)) {
      throw new WorkflowExecutionError(
        'WORKFLOW_INPUT_INVALID',
        'utcTimestamp must be a real UTC calendar timestamp.',
      );
    }
    const currentUtcDate = dateFromTimestamp(input.utcTimestamp);
    const windowStartUtcDate = sevenDayWindowStart(currentUtcDate);
    const selectionSeed =
      input.selectionSeed?.trim() || randomBytes(16).toString('hex');
    const assignments = ([1, 2, 3] as const).map((slot) => ({
      slot,
      industryCandidates: randomizedCandidates(selectionSeed, slot),
      currentUtcDate,
      windowStartUtcDate,
      selectionSeed,
    }));

    const rawFacts = await parallel(
      assignments.map(
        (assignment) => () =>
          agent<DailyFact, ResearchAssignment>({
            label: `daily-facts-research-${assignment.slot}`,
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt: promptFor(assignment),
            input: assignment,
            outputSchema: schemaFor(assignment),
          }),
      ),
    );

    let facts: DailyFact[];
    try {
      const controlledSources =
        process.env.CODEX_DAILY_FACTS_ALLOW_CONTROLLED_SOURCES === '1';
      facts = validateDailyFacts(
        rawFacts,
        currentUtcDate,
        controlledSources
          ? undefined
          : { sourceDateMode: 'unverified-agent-claim' },
      );
      for (const [index, fact] of facts.entries()) {
        if (!assignments[index]?.industryCandidates.includes(fact.industry)) {
          throw new Error(
            'Researcher selected an industry outside its randomized candidate bucket.',
          );
        }
      }
      if (controlledSources) {
        facts = facts.map((fact) => ({
          ...fact,
          articles: fact.articles.slice(0, 2),
        }));
        facts = validateDailyFacts(facts, currentUtcDate);
      } else {
        facts = await Promise.all(
          facts.map((fact) => verifyDailyFactSources(fact, currentUtcDate)),
        );
        facts = validateDailyFacts(facts, currentUtcDate, {
          sourceDateMode: 'publisher-metadata',
        });
      }
    } catch (error) {
      throw new WorkflowExecutionError(
        'WORKFLOW_OUTPUT_SCHEMA_FAILED',
        'Daily-facts research did not satisfy the public content contract.',
        {
          contractIssue:
            error instanceof Error
              ? error.message
              : 'Unknown daily-facts contract failure.',
        },
      );
    }

    const generatedAt = `${currentUtcDate}T${input.utcTimestamp.slice(9, 11)}:${input.utcTimestamp.slice(11, 13)}:${input.utcTimestamp.slice(13, 15)}.000Z`;
    const reportBytes = renderDailyFacts(facts, {
      generatedAt,
      selectionSeed,
      assignedIndustries: facts.map((item) => item.industry),
    });
    const report = await artifact('DAILY_FACTS.md', {
      value: reportBytes,
      mediaType: 'text/markdown',
      publishPath: `.agent/testing/workflows/${input.utcTimestamp}/DAILY_FACTS.md`,
    });
    return {
      selectionSeed,
      assignments,
      facts,
      report,
    };
  },
});
