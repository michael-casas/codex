export interface DailyFactsArticle {
  title: string;
  url: string;
  publishedAt: string;
  publisher: string;
  publicationDateEvidence: string;
}

export interface DailyFact {
  industry: string;
  topic: string;
  asOfDate: string;
  summary: string;
  articles: DailyFactsArticle[];
}

export interface RenderDailyFactsOptions {
  generatedAt: string;
  selectionSeed?: string;
  assignedIndustries?: string[];
}

export interface ValidateDailyFactsOptions {
  sourceDateMode?:
    | 'strict-claim'
    | 'unverified-agent-claim'
    | 'publisher-metadata';
}

export class DailyFactsContractError extends Error {
  readonly code = 'DAILY_FACTS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'DailyFactsContractError';
  }
}

function fail(message: string): never {
  throw new DailyFactsContractError(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function boundedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== 'string') return fail(`${label} must be text.`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < minimum || text.length > maximum) {
    return fail(`${label} is outside its substantive length boundary.`);
  }
  return text;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const relevanceStopWords = new Set([
  'about',
  'after',
  'amid',
  'from',
  'into',
  'latest',
  'more',
  'news',
  'over',
  'that',
  'their',
  'this',
  'through',
  'under',
  'update',
  'with',
]);

const fallbackLanguage =
  /\b(?:no qualifying|no verified|nothing qualifying|unable to verify|could not verify|couldn't verify|no current topic|no citations?|no sources?)\b/i;

function rejectFallback(value: string, label: string): void {
  if (fallbackLanguage.test(value)) {
    return fail(
      `${label} must report verified news rather than fallback text.`,
    );
  }
}

function significantTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 5 && !relevanceStopWords.has(token)),
    ),
  ];
}

function headlineRelevant(title: string, briefContext: string): boolean {
  const titleTokens = significantTokens(title);
  const titleAcronyms = [
    ...new Set(
      [...title.matchAll(/\b[A-Z][A-Z0-9]{1,4}\b/g)].map((match) =>
        match[0].toLowerCase(),
      ),
    ),
  ];
  return (
    titleTokens.some((token) => briefContext.includes(token)) ||
    titleAcronyms.some((token) =>
      new RegExp(`\\b${token}\\b`, 'i').test(briefContext),
    )
  );
}

function utcDateValue(
  value: unknown,
  label: string,
): {
  text: string;
  milliseconds: number;
} {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail(`${label} must be an ISO UTC calendar date.`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== value
  ) {
    return fail(`${label} must be a real UTC calendar date.`);
  }
  return { text: value, milliseconds };
}

function article(
  value: unknown,
  currentUtcDate: string,
  briefContext: string,
  sourceDateMode: NonNullable<ValidateDailyFactsOptions['sourceDateMode']>,
): DailyFactsArticle {
  const source = record(value, 'Article');
  const title = boundedText(source.title, 'Article title', 8, 200);
  const urlText = boundedText(source.url, 'Article URL', 12, 2_048);
  const publisher = boundedText(source.publisher, 'Publisher', 2, 100);
  rejectFallback(title, 'Article title');
  const publicationDateEvidence = boundedText(
    source.publicationDateEvidence,
    'Publication date evidence',
    8,
    100,
  );
  if (
    sourceDateMode !== 'unverified-agent-claim' &&
    !headlineRelevant(title, briefContext)
  ) {
    return fail(
      'Every article headline must be visibly relevant to its brief.',
    );
  }
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return fail('Article URL must be absolute.');
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURI(url.pathname);
  } catch {
    return fail('Article URL path must use valid percent encoding.');
  }
  const canonicalPath = decodedPath.replace(/\p{Cf}/gu, '');
  if (canonicalPath !== decodedPath) {
    url.pathname = canonicalPath;
  }
  if (url.protocol !== 'https:' || !url.hostname.includes('.')) {
    return fail('Article URL must be a direct HTTPS link.');
  }
  const disallowedHosts = [
    'google.com',
    'bing.com',
    'perplexity.ai',
    'chatgpt.com',
    'openai.com',
    'reddit.com',
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'youtube.com',
    'tiktok.com',
  ];
  if (
    disallowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  ) {
    return fail('Article URL must link directly to the publishing source.');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const lastSegment = segments.at(-1)?.replace(/\.[a-z0-9]+$/i, '') ?? '';
  const isArchiveRoute = segments.some((segment) =>
    /^(?:archive|archives|categories|category|tags|tag)$/i.test(segment),
  );
  const isBareDateRoute =
    /\/20\d{2}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/?$/i.test(
      url.pathname,
    );
  if (
    segments.length < 2 ||
    isArchiveRoute ||
    isBareDateRoute ||
    /^(?:index|results|documents|investors|news|press|search)$/i.test(
      lastSegment,
    ) ||
    /(?:^|\/)search(?:\/|$)/i.test(url.pathname)
  ) {
    return fail('Article URL must identify one article or press release.');
  }
  const publishedAt = utcDateValue(
    source.publishedAt,
    'Article publication date',
  );
  const currentDate = utcDateValue(currentUtcDate, 'Current UTC date');
  const ageInDays =
    (currentDate.milliseconds - publishedAt.milliseconds) / 86_400_000;
  if (!Number.isInteger(ageInDays) || ageInDays < 0 || ageInDays > 7) {
    return fail(
      'Every article must be published no more than seven UTC days before the current date.',
    );
  }
  const [year, month, day] = publishedAt.text.split('-');
  const evidence = publicationDateEvidence.toLowerCase();
  const monthName = new Date(
    `${publishedAt.text}T00:00:00.000Z`,
  ).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const shortMonth = new Date(
    `${publishedAt.text}T00:00:00.000Z`,
  ).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const monthAliases = [
    'en-US',
    'es-ES',
    'fr-FR',
    'de-DE',
    'it-IT',
    'pt-BR',
    'nl-NL',
    'pl-PL',
    'sv-SE',
  ].flatMap((locale) =>
    (['long', 'short'] as const).map((width) =>
      new Intl.DateTimeFormat(locale, {
        month: width,
        timeZone: 'UTC',
      })
        .format(new Date(`${publishedAt.text}T00:00:00.000Z`))
        .replace(/\.$/, ''),
    ),
  );
  const monthPattern = [...new Set(monthAliases)]
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const monthFirstDate = new RegExp(
    `(?:${monthPattern})\\.?\\s+0?${Number(day)}\\b.{0,40}\\b${year}\\b`,
    'i',
  );
  const dayFirstDate = new RegExp(
    `\\b0?${Number(day)}\\s+(?:${monthPattern})\\.?\\b.{0,40}\\b${year}\\b`,
    'i',
  );
  if (
    sourceDateMode !== 'unverified-agent-claim' &&
    ![
      publishedAt.text,
      `${year}/${month}/${day}`,
      `${monthName} ${Number(day)}, ${year}`,
      `${shortMonth} ${Number(day)}, ${year}`,
      `${Number(day)} ${monthName} ${year}`,
      `${Number(day)} ${shortMonth} ${year}`,
    ].some((candidate) => evidence.includes(candidate.toLowerCase())) &&
    !monthFirstDate.test(publicationDateEvidence) &&
    !dayFirstDate.test(publicationDateEvidence)
  ) {
    return fail(
      'Publication date evidence must visibly name the qualifying article date.',
    );
  }
  if (sourceDateMode === 'strict-claim') {
    const numericPathDate = /\/(20\d{2})\/(\d{2})\//.exec(url.pathname);
    if (
      numericPathDate &&
      `${numericPathDate[1]}-${numericPathDate[2]}` !==
        publishedAt.text.slice(0, 7)
    ) {
      return fail(
        'Article URL date conflicts with the qualifying article date.',
      );
    }
    const monthPathDate =
      /\/(20\d{2})\/(january|february|march|april|may|june|july|august|september|october|november|december)\//i.exec(
        url.pathname,
      );
    if (monthPathDate) {
      const pathMonth = new Date(
        `${monthPathDate[2]} 1, ${monthPathDate[1]} 00:00:00 UTC`,
      ).getUTCMonth();
      if (
        Number(monthPathDate[1]) !== Number(year) ||
        pathMonth !== Number(month) - 1
      ) {
        return fail(
          'Article URL month conflicts with the qualifying article date.',
        );
      }
    }
  }
  return {
    title,
    url: url.toString(),
    publishedAt: publishedAt.text,
    publisher,
    publicationDateEvidence,
  };
}

export function validateDailyFacts(
  value: unknown,
  currentUtcDate: string,
  options: ValidateDailyFactsOptions = {},
): DailyFact[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentUtcDate)) {
    return fail('Current UTC date is invalid.');
  }
  if (!Array.isArray(value) || value.length !== 3) {
    return fail('Daily facts must contain exactly three reports.');
  }
  const pairs = new Set<string>();
  const facts = value.map((candidate, index) => {
    const source = record(candidate, `Report ${index + 1}`);
    const industry = boundedText(source.industry, 'Industry', 3, 80);
    const topic = boundedText(source.topic, 'Topic', 3, 120);
    if (source.asOfDate !== currentUtcDate) {
      return fail('Every report must use the current UTC research date.');
    }
    const summary = boundedText(source.summary, 'Summary', 120, 900);
    rejectFallback(`${industry} ${topic} ${summary}`, 'Daily-facts brief');
    if (summary.split(/\s+/).length < 20) {
      return fail('Summary must be substantive rather than boilerplate.');
    }
    if (!Array.isArray(source.articles) || source.articles.length < 2) {
      return fail('Every report must include at least two articles.');
    }
    if (source.articles.length > 5) {
      return fail('Every report must remain a short bounded briefing.');
    }
    const pair = `${normalized(industry)}\0${normalized(topic)}`;
    if (pairs.has(pair)) {
      return fail('Industry and topic pairs must be distinct.');
    }
    pairs.add(pair);
    const briefContext = normalized(`${industry} ${topic} ${summary}`);
    const sourceDateMode = options.sourceDateMode ?? 'strict-claim';
    return {
      industry,
      topic,
      asOfDate: currentUtcDate,
      summary,
      articles: source.articles.map((item) =>
        article(item, currentUtcDate, briefContext, sourceDateMode),
      ),
    };
  });
  return facts;
}

function visiblePublicationDate(
  page: string,
  publishedAt: string,
): string | undefined {
  const parsed = new Date(`${publishedAt}T00:00:00.000Z`);
  const candidates = [
    parsed.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  ];
  const normalizedPage = page.toLowerCase();
  return candidates.find((candidate) =>
    normalizedPage.includes(candidate.toLowerCase()),
  );
}

function visiblePublisherPublicationDate(
  page: string,
  publishedAt: string,
): string | undefined {
  const parsed = new Date(`${publishedAt}T00:00:00.000Z`);
  const candidates = [
    parsed.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  ];
  const visibleText = page
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/\s+/g, ' ');
  return candidates.find((candidate) => {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const semanticTime = new RegExp(
      `<time\\b[^>]{0,500}>[^<]{0,160}${escaped}[^<]{0,160}<\\/time>`,
      'i',
    );
    const labelledDate = new RegExp(
      `\\b(?:published|publication date|posted)\\b.{0,100}${escaped}`,
      'i',
    );
    return semanticTime.test(page) || labelledDate.test(visibleText);
  });
}

function publicationDates(page: string): string[] {
  const values = [
    ...page.matchAll(/["']datePublished["']\s*:\s*["'](20\d{2}-\d{2}-\d{2})/gi),
    ...page.matchAll(
      /(?:article:published_time|datePublished)[^>]{0,300}?content=["'](20\d{2}-\d{2}-\d{2})/gi,
    ),
    ...page.matchAll(
      /content=["'](20\d{2}-\d{2}-\d{2})[^"']*["'][^>]{0,300}?(?:article:published_time|datePublished)/gi,
    ),
    ...page.matchAll(
      /<time\b[^>]{0,300}?datetime=["'](20\d{2}-\d{2}-\d{2})[^"']*["']/gi,
    ),
  ].map((match) => match[1]!);
  return [...new Set(values)];
}

type SourceRejectionReason =
  | 'off-topic'
  | 'fetch-failed'
  | 'http-status'
  | 'content-type'
  | 'title-mismatch'
  | 'publication-date';

type SourceVerificationResult =
  | { article: DailyFactsArticle }
  | { rejected: SourceRejectionReason };

async function verifySourceCandidate(
  candidate: DailyFactsArticle,
  fact: DailyFact,
  currentUtcDate: string,
  fetcher: typeof fetch,
): Promise<SourceVerificationResult> {
  try {
    const briefContext = normalized(
      `${fact.industry} ${fact.topic} ${fact.summary}`,
    );
    if (!headlineRelevant(candidate.title, briefContext)) {
      return { rejected: 'off-topic' };
    }
    let response: Response;
    try {
      response = await fetcher(candidate.url, {
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'codex-workflows-daily-facts-verifier/1.0',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { rejected: 'fetch-failed' };
    }
    if (!response.ok) {
      return { rejected: 'http-status' };
    }
    if (
      !/(?:text\/html|application\/xhtml\+xml)/i.test(
        response.headers.get('content-type') ?? '',
      )
    ) {
      return { rejected: 'content-type' };
    }
    const page = (await response.text()).slice(0, 2_000_000);
    const normalizedPage = page.toLowerCase();
    const titleTokens = significantTokens(candidate.title);
    if (
      titleTokens.filter((token) => normalizedPage.includes(token)).length <
      Math.min(2, titleTokens.length)
    ) {
      return { rejected: 'title-mismatch' };
    }
    const current = utcDateValue(currentUtcDate, 'Current UTC date');
    for (const publishedAt of publicationDates(page)) {
      const published = utcDateValue(publishedAt, 'Publisher publication date');
      const ageInDays =
        (current.milliseconds - published.milliseconds) / 86_400_000;
      if (!Number.isInteger(ageInDays) || ageInDays < 0 || ageInDays > 7) {
        continue;
      }
      const visibleDate = visiblePublicationDate(page, publishedAt);
      const verifiedUrl = response.url || candidate.url;
      return {
        article: {
          ...candidate,
          url: verifiedUrl,
          publishedAt,
          publicationDateEvidence: `${publishedAt}: ${
            visibleDate ?? 'publisher datePublished metadata'
          }`,
        },
      };
    }
    const claimed = utcDateValue(
      candidate.publishedAt,
      'Agent-claimed publication date',
    );
    const claimedAgeInDays =
      (current.milliseconds - claimed.milliseconds) / 86_400_000;
    const visibleClaim = visiblePublisherPublicationDate(
      page,
      candidate.publishedAt,
    );
    if (
      visibleClaim &&
      Number.isInteger(claimedAgeInDays) &&
      claimedAgeInDays >= 0 &&
      claimedAgeInDays <= 7
    ) {
      const verifiedUrl = response.url || candidate.url;
      return {
        article: {
          ...candidate,
          url: verifiedUrl,
          publicationDateEvidence: `${candidate.publishedAt}: ${visibleClaim}`,
        },
      };
    }
    return { rejected: 'publication-date' };
  } catch {
    return { rejected: 'fetch-failed' };
  }
}

export async function verifyDailyFactSources(
  fact: DailyFact,
  currentUtcDate: string,
  fetcher: typeof fetch = fetch,
): Promise<DailyFact> {
  const results = await Promise.all(
    fact.articles.map((candidate) =>
      verifySourceCandidate(candidate, fact, currentUtcDate, fetcher),
    ),
  );
  const verified = results.flatMap((result) =>
    'article' in result ? [result.article] : [],
  );
  if (verified.length < 2) {
    const reasonOrder: readonly SourceRejectionReason[] = [
      'off-topic',
      'fetch-failed',
      'http-status',
      'content-type',
      'title-mismatch',
      'publication-date',
    ];
    const rejectionCounts = reasonOrder
      .map((reason) => ({
        reason,
        count: results.filter(
          (result) => 'rejected' in result && result.rejected === reason,
        ).length,
      }))
      .filter(({ count }) => count > 0)
      .map(({ reason, count }) => `${reason}=${count}`)
      .join(', ');
    return fail(
      `Every report must retain at least two ordinary-GET publisher-verified current sources. Verified ${verified.length} of ${results.length} reserve sources; rejected ${rejectionCounts}.`,
    );
  }
  return { ...fact, articles: verified.slice(0, 2) };
}

export function renderDailyFacts(
  facts: DailyFact[],
  options: RenderDailyFactsOptions,
): string {
  if (facts.length !== 3) {
    return fail('Renderer requires exactly three validated reports.');
  }
  const date = options.generatedAt.slice(0, 10);
  const lines = [
    `# Daily Facts — ${date}`,
    '',
    `Generated at: ${options.generatedAt}`,
    ...(options.selectionSeed
      ? [`Selection seed: \`${options.selectionSeed}\``]
      : []),
    ...(options.assignedIndustries
      ? [`Random industries: ${options.assignedIndustries.join(', ')}`]
      : []),
    '',
  ];
  for (const fact of facts) {
    lines.push(
      `## What's going on with ${fact.industry} in ${fact.topic}`,
      '',
      fact.summary,
      '',
      'Articles:',
      ...fact.articles.map(
        (item) =>
          `- [${item.title}](${item.url}) — ${item.publisher}, ${item.publishedAt}`,
      ),
      '',
    );
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
