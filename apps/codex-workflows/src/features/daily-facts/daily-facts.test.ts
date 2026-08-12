import { describe, expect, test } from 'vitest';

interface DailyFactsArticle {
  title: string;
  url: string;
  publishedAt: string;
  publisher: string;
  publicationDateEvidence: string;
}

interface DailyFact {
  industry: string;
  topic: string;
  asOfDate: string;
  summary: string;
  articles: DailyFactsArticle[];
}

interface DailyFactsContractApi {
  validateDailyFacts(
    value: unknown,
    currentUtcDate: string,
    options?: {
      sourceDateMode?:
        | 'strict-claim'
        | 'unverified-agent-claim'
        | 'publisher-metadata';
    },
  ): DailyFact[];
  renderDailyFacts(
    facts: DailyFact[],
    options: { generatedAt: string },
  ): string;
}

async function contractApi(): Promise<DailyFactsContractApi> {
  const modulePath = './support/contract.js';
  let loaded: unknown;
  let failure: unknown;
  try {
    loaded = await import(modulePath);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeUndefined();
  expect(loaded).toEqual(
    expect.objectContaining({
      validateDailyFacts: expect.any(Function),
      renderDailyFacts: expect.any(Function),
    }),
  );
  return loaded as DailyFactsContractApi;
}

const currentDate = '2026-08-10';
const validFacts: DailyFact[] = [
  {
    industry: 'Semiconductors',
    topic: 'Advanced packaging capacity',
    asOfDate: currentDate,
    summary:
      'Chipmakers and suppliers are expanding advanced packaging capacity as AI accelerators require more high-bandwidth memory and tightly integrated chiplets. Yield, substrates, and dependable volume production now determine how quickly announced capacity becomes usable supply.',
    articles: [
      {
        title: "AI's chip era",
        url: 'https://news.example/semiconductors/packaging-investment',
        publishedAt: currentDate,
        publisher: 'Semiconductor News',
        publicationDateEvidence: 'August 10, 2026',
      },
      {
        title: 'Substrate suppliers prepare new capacity',
        url: 'https://wire.example/chips/substrate-capacity',
        publishedAt: '2026-08-03',
        publisher: 'Chip Wire',
        publicationDateEvidence: '03 ago 2026 - 11:00 CEST',
      },
    ],
  },
  {
    industry: 'Consumer applications',
    topic: 'App platform distribution policy',
    asOfDate: currentDate,
    summary:
      'Consumer application publishers are adapting product and pricing plans as mobile platforms revise distribution rules and subscription tooling. Discovery, payment choice, and developer controls now determine whether policy changes improve reach and margins.',
    articles: [
      {
        title: 'App publishers revise mobile distribution plans',
        url: 'https://news.example/apps/mobile-distribution',
        publishedAt: currentDate,
        publisher: 'App Economy News',
        publicationDateEvidence: 'August 10, 2026',
      },
      {
        title: 'Subscription platforms add new developer controls',
        url: 'https://wire.example/apps/subscription-controls',
        publishedAt: currentDate,
        publisher: 'App Platform Wire',
        publicationDateEvidence: 'August 10, 2026',
      },
    ],
  },
  {
    industry: 'Media and entertainment',
    topic: 'Streaming discovery and format expansion',
    asOfDate: currentDate,
    summary:
      'Streaming and media platforms are expanding into new formats while using recommendation systems to compete for limited audience attention. Product teams are combining video, audio, games, and creator tools, making discovery quality and rights economics central to retention.',
    articles: [
      {
        title: 'Streaming platforms expand interactive discovery',
        url: 'https://news.example/media/streaming-discovery',
        publishedAt: currentDate,
        publisher: 'Media News',
        publicationDateEvidence: 'August 10, 2026',
      },
      {
        title: 'Entertainment apps add new content formats',
        url: 'https://wire.example/media/content-formats',
        publishedAt: currentDate,
        publisher: 'Streaming Wire',
        publicationDateEvidence: 'August 10, 2026',
      },
    ],
  },
];

// === L1: UNIT TESTS ===
describe('[L1:UNIT] daily-facts content contract', () => {
  test('[L1:UNIT] DF-GC1-011 accepts exactly three distinct current-UTC industry/topic reports with substantive summaries and direct article links from the Founder-approved seven-day UTC window', async () => {
    const contract = await contractApi();
    const accepted = contract.validateDailyFacts(validFacts, currentDate);
    expect(accepted).toEqual(validFacts);
    const markdown = contract.renderDailyFacts(accepted, {
      generatedAt: '2026-08-10T17:00:00.000Z',
    });
    expect(markdown).toContain('# Daily Facts — 2026-08-10');
    for (const fact of validFacts) {
      expect(markdown).toContain(
        `## What's going on with ${fact.industry} in ${fact.topic}`,
      );
      expect(markdown).toContain(fact.summary);
      for (const article of fact.articles) {
        expect(markdown).toContain(`[${article.title}](${article.url})`);
      }
    }
  });

  test('[L1:UNIT] DF-GC1-011 canonicalizes invisible URL formatting bytes copied after a direct article path', async () => {
    const contract = await contractApi();
    const candidate = structuredClone(validFacts);
    candidate[0]!.articles[0]!.url = `${candidate[0]!.articles[0]!.url}%E2%80%8B%E2%80%8B`;
    const accepted = contract.validateDailyFacts(candidate, currentDate);
    expect(accepted[0]!.articles[0]!.url).toBe(
      `${validFacts[0]!.articles[0]!.url}`,
    );
  });

  test('[L1:UNIT] DF-GC1-011 defers agent-claimed URL date conflicts until publisher metadata can correct or discard the reserve', async () => {
    const contract = await contractApi();
    const candidate = structuredClone(validFacts);
    candidate[1]!.articles[0]!.url =
      'https://news.example/2026/07/apps/mobile-distribution';
    candidate[1]!.articles[0]!.publishedAt = '2026-08-09';
    candidate[1]!.articles[0]!.publicationDateEvidence =
      '2026-08-09: August 9, 2026';

    expect(() => contract.validateDailyFacts(candidate, currentDate)).toThrow(
      'Article URL date conflicts with the qualifying article date.',
    );
    expect(() =>
      contract.validateDailyFacts(candidate, currentDate, {
        sourceDateMode: 'unverified-agent-claim',
      }),
    ).not.toThrow();

    candidate[1]!.articles[0]!.publishedAt = currentDate;
    candidate[1]!.articles[0]!.publicationDateEvidence =
      '2026-08-10: publisher datePublished metadata';
    expect(() =>
      contract.validateDailyFacts(candidate, currentDate, {
        sourceDateMode: 'publisher-metadata',
      }),
    ).not.toThrow();
  });

  test('[L1:UNIT] DF-GC1-011 verifies reserve citations through ordinary GET, corrects publisher dates, and discards stale or broken pages before publication', async () => {
    const modulePath = './support/contract.js';
    const loaded = (await import(modulePath)) as {
      verifyDailyFactSources?: (
        fact: DailyFact,
        currentUtcDate: string,
        fetcher: typeof fetch,
      ) => Promise<DailyFact>;
    };
    expect(loaded.verifyDailyFactSources).toEqual(expect.any(Function));

    const candidate = structuredClone(validFacts[1]!);
    candidate.articles = [
      {
        ...candidate.articles[0]!,
        publishedAt: '2026-08-09',
        publicationDateEvidence: '2026-08-09: August 9, 2026',
      },
      candidate.articles[1]!,
      {
        title: 'Mobile platforms publish another distribution update',
        url: 'https://news.example/apps/stale-distribution-update',
        publishedAt: currentDate,
        publisher: 'App Economy News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      {
        title: 'Developer controls expand across application stores',
        url: 'https://wire.example/apps/broken-developer-controls',
        publishedAt: currentDate,
        publisher: 'App Platform Wire',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
    ];

    const pages = new Map([
      [candidate.articles[0]!.url, { status: 200, date: currentDate }],
      [candidate.articles[1]!.url, { status: 200, date: currentDate }],
      [candidate.articles[2]!.url, { status: 200, date: '2026-08-01' }],
      [candidate.articles[3]!.url, { status: 404, date: currentDate }],
    ]);
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      const page = pages.get(url);
      const article = candidate.articles.find((item) => item.url === url)!;
      const date = page?.date ?? currentDate;
      const visibleDate = new Date(`${date}T00:00:00.000Z`).toLocaleString(
        'en-US',
        { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
      );
      const visibleMarkup =
        url === candidate.articles[0]!.url ? '' : `<time>${visibleDate}</time>`;
      return new Response(
        `<html><head><script type="application/ld+json">{"datePublished":"${date}T12:00:00Z"}</script></head><body><h1>${article.title}</h1>${visibleMarkup}</body></html>`,
        {
          status: page?.status ?? 500,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      );
    }) as typeof fetch;

    const verified = await loaded.verifyDailyFactSources!(
      candidate,
      currentDate,
      fetcher,
    );
    expect(verified.articles).toHaveLength(2);
    expect(verified.articles.map((article) => article.url)).toEqual([
      candidate.articles[0]!.url,
      candidate.articles[1]!.url,
    ]);
    expect(verified.articles[0]).toEqual(
      expect.objectContaining({
        publishedAt: currentDate,
        publicationDateEvidence: '2026-08-10: publisher datePublished metadata',
      }),
    );
  });

  test('[L1:UNIT] DF-GC1-011 accepts an ordinary-GET publisher page whose qualifying date is visible in the article time element without datePublished metadata', async () => {
    const modulePath = './support/contract.js';
    const loaded = (await import(modulePath)) as {
      verifyDailyFactSources: (
        fact: DailyFact,
        currentUtcDate: string,
        fetcher: typeof fetch,
      ) => Promise<DailyFact>;
    };
    const sourceFact = validFacts[1];
    if (!sourceFact) throw new Error('Fixture report 2 is required.');
    const candidate = structuredClone(sourceFact);
    const firstArticle = candidate.articles[0];
    if (!firstArticle) throw new Error('Fixture article 1 is required.');
    firstArticle.publishedAt = '2026-08-09';
    firstArticle.publicationDateEvidence = '2026-08-09: August 9, 2026';

    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      const article = candidate.articles.find((item) => item.url === url);
      if (!article) throw new Error('Requested article fixture is required.');
      const date = article.publishedAt;
      const visibleDate = new Date(`${date}T00:00:00.000Z`).toLocaleString(
        'en-US',
        { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
      );
      return new Response(
        `<html><body><article><h1>${article.title}</h1><p>Published <time>${visibleDate}</time></p></article></body></html>`,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      );
    }) as typeof fetch;

    const verified = await loaded.verifyDailyFactSources(
      candidate,
      currentDate,
      fetcher,
    );
    expect(verified.articles).toHaveLength(2);
    expect(verified.articles).toEqual(
      candidate.articles.map((article) => ({
        ...article,
        publicationDateEvidence: `${article.publishedAt}: ${new Date(
          `${article.publishedAt}T00:00:00.000Z`,
        ).toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        })}`,
      })),
    );
  });

  test('[L1:UNIT] DF-GC1-011 reports redacted source-rejection counts without leaking reserve URLs', async () => {
    const modulePath = './support/contract.js';
    const loaded = (await import(modulePath)) as {
      verifyDailyFactSources: (
        fact: DailyFact,
        currentUtcDate: string,
        fetcher: typeof fetch,
      ) => Promise<DailyFact>;
    };
    const sourceFact = validFacts[1];
    if (!sourceFact) throw new Error('Fixture report 2 is required.');
    const candidate = structuredClone(sourceFact);
    const firstArticle = candidate.articles[0];
    const secondArticle = candidate.articles[1];
    if (!firstArticle || !secondArticle) {
      throw new Error('Two fixture articles are required.');
    }
    firstArticle.title = 'Quantum telescope maps distant galaxies';
    const requestedUrls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response('temporarily unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      });
    }) as typeof fetch;

    const verification = loaded.verifyDailyFactSources(
      candidate,
      currentDate,
      fetcher,
    );
    await expect(verification).rejects.toThrow(
      'Verified 0 of 2 reserve sources; rejected off-topic=1, http-status=1.',
    );
    expect(requestedUrls).toEqual([secondArticle.url]);
    await expect(verification).rejects.not.toThrow(secondArticle.url);
  });

  test('[L1:UNIT] DF-GC1-011 discards off-topic reserves before ordinary GET and strictly validates the retained publisher-verified pair', async () => {
    const contract = await contractApi();
    const modulePath = './support/contract.js';
    const loaded = (await import(modulePath)) as {
      verifyDailyFactSources: (
        fact: DailyFact,
        currentUtcDate: string,
        fetcher: typeof fetch,
      ) => Promise<DailyFact>;
    };
    const candidate = structuredClone(validFacts[1]!);
    const offTopicUrl =
      'https://science.example/astronomy/quantum-telescope-galaxies';
    candidate.articles = [
      {
        title: 'Quantum telescope maps distant galaxies',
        url: offTopicUrl,
        publishedAt: currentDate,
        publisher: 'Astronomy News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
      ...candidate.articles,
      {
        title: 'Mobile platforms publish another distribution update',
        url: 'https://news.example/apps/stale-distribution-update',
        publishedAt: currentDate,
        publisher: 'App Economy News',
        publicationDateEvidence: '2026-08-10: August 10, 2026',
      },
    ];

    const prevalidated = contract.validateDailyFacts(
      [validFacts[0], candidate, validFacts[2]],
      currentDate,
      { sourceDateMode: 'unverified-agent-claim' },
    );
    const requestedUrls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === offTopicUrl) {
        throw new Error('Off-topic reserve must be rejected before GET.');
      }
      const article = candidate.articles.find((item) => item.url === url)!;
      const date = url.includes('stale') ? '2026-08-01' : currentDate;
      return new Response(
        `<html><head><script type="application/ld+json">{"datePublished":"${date}T12:00:00Z"}</script></head><body><h1>${article.title}</h1></body></html>`,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      );
    }) as typeof fetch;

    const verified = await loaded.verifyDailyFactSources(
      prevalidated[1]!,
      currentDate,
      fetcher,
    );
    expect(requestedUrls).not.toContain(offTopicUrl);
    expect(verified.articles.map((article) => article.url)).toEqual(
      validFacts[1]!.articles.map((article) => article.url),
    );
    expect(() =>
      contract.validateDailyFacts(
        [validFacts[0], verified, validFacts[2]],
        currentDate,
        { sourceDateMode: 'publisher-metadata' },
      ),
    ).not.toThrow();
  });

  test.each([
    ['two results', validFacts.slice(0, 2)],
    ['four results', [...validFacts, { ...validFacts[0], industry: 'Energy' }]],
    [
      'duplicate normalized pair',
      [
        ...validFacts.slice(0, 2),
        {
          ...validFacts[0],
          industry: '  SEMICONDUCTORS ',
          topic: 'advanced   packaging capacity',
        },
      ],
    ],
    [
      'stale research date',
      [
        validFacts[0],
        validFacts[1],
        { ...validFacts[2], asOfDate: '2026-08-09' },
      ],
    ],
    [
      'article older than the seven-day UTC window',
      [
        validFacts[0],
        validFacts[1],
        {
          ...validFacts[2],
          articles: [
            {
              ...validFacts[2].articles[0],
              publishedAt: '2026-08-02',
              publicationDateEvidence: 'August 2, 2026',
            },
            validFacts[2].articles[1],
          ],
        },
      ],
    ],
    [
      'future-dated article',
      [
        validFacts[0],
        validFacts[1],
        {
          ...validFacts[2],
          articles: [
            {
              ...validFacts[2].articles[0],
              publishedAt: '2026-08-11',
              publicationDateEvidence: 'August 11, 2026',
            },
            validFacts[2].articles[1],
          ],
        },
      ],
    ],
    [
      'missing article',
      [
        validFacts[0],
        { ...validFacts[1], articles: validFacts[1].articles.slice(0, 1) },
        validFacts[2],
      ],
    ],
    [
      'non-https link',
      [
        validFacts[0],
        validFacts[1],
        {
          ...validFacts[2],
          articles: [
            {
              ...validFacts[2].articles[0],
              url: 'http://news.example/insecure',
            },
            validFacts[2].articles[1],
          ],
        },
      ],
    ],
    [
      'placeholder no-qualifying brief',
      [
        validFacts[0],
        {
          ...validFacts[1],
          topic: 'No qualifying current topic verified',
          summary:
            'No qualifying current topic was verified after searching the requested sources, so this placeholder explanation supplies enough words to cross the superficial summary length boundary without reporting any actual current industry development.',
          articles: [
            {
              title: 'No qualifying article verified',
              url: 'https://www.engadget.com/category/apps/2026/08/10',
              publishedAt: currentDate,
              publisher: 'Engadget',
              publicationDateEvidence: 'August 10, 2026',
            },
            {
              title: 'No qualifying source verified',
              url: 'https://www.androidauthority.com/mobile-technology/2026/08/10',
              publishedAt: currentDate,
              publisher: 'Android Authority',
              publicationDateEvidence: 'August 10, 2026',
            },
          ],
        },
        validFacts[2],
      ],
    ],
    [
      'category or date-index URL presented as an article',
      [
        validFacts[0],
        {
          ...validFacts[1],
          topic: 'Mobile software platforms launch verified feature updates',
          summary:
            'Mobile software platforms are launching verified feature updates across consumer applications, giving developers and users concrete changes to evaluate while current publishers explain the same coherent industry development in detail.',
          articles: [
            {
              title:
                'Mobile software platforms launch verified feature updates',
              url: 'https://www.engadget.com/category/apps/2026/08/10',
              publishedAt: currentDate,
              publisher: 'Engadget',
              publicationDateEvidence: 'August 10, 2026',
            },
            validFacts[1].articles[1],
          ],
        },
        validFacts[2],
      ],
    ],
    [
      'off-topic article',
      [
        validFacts[0],
        validFacts[1],
        {
          ...validFacts[2],
          articles: [
            {
              ...validFacts[2].articles[0],
              title: 'Regional rainfall forecast changes agricultural planning',
              url: 'https://weather.example/forecast/regional-rainfall-planning',
            },
            validFacts[2].articles[1],
          ],
        },
      ],
    ],
    [
      'boilerplate summary',
      [
        validFacts[0],
        validFacts[1],
        { ...validFacts[2], summary: 'News happened.' },
      ],
    ],
  ])('rejects %s', async (_caseName, candidate) => {
    const contract = await contractApi();
    expect(() => contract.validateDailyFacts(candidate, currentDate)).toThrow(
      expect.objectContaining({ code: 'DAILY_FACTS_INVALID' }),
    );
  });
});
