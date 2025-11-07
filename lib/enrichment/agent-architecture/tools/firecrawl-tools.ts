import Firecrawl from '@mendable/firecrawl-js';

// Simple in-process rate-limit awareness for Firecrawl API
let firecrawlRateLimitedUntil = 0;

// In-process request throttle (best-effort, single process)
const FIRECRAWL_MAX_RPM = Number.parseInt(process.env.FIRECRAWL_MAX_RPM || '5', 10); // default 5 req/min
const firecrawlRequestTimes: number[] = [];

async function ensureWithinRateLimit(): Promise<void> {
  if (FIRECRAWL_MAX_RPM <= 0) return; // throttling disabled
  const now = Date.now();
  // Cleanup timestamps older than 60s
  for (let i = firecrawlRequestTimes.length - 1; i >= 0; i--) {
    const timestamp = firecrawlRequestTimes[i];
    if (timestamp && now - timestamp > 60_000) firecrawlRequestTimes.splice(i, 1);
  }

  if (firecrawlRequestTimes.length >= FIRECRAWL_MAX_RPM) {
    const earliest = firecrawlRequestTimes[0];
    if (earliest) {
      const waitMs = Math.max(earliest + 60_000 - now, 0) + 25; // small jitter
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  firecrawlRequestTimes.push(Date.now());
}

// Lightweight in-memory cache with TTL and promise deduplication
type CacheEntry<T> = { expiresAt: number; value?: T; promise?: Promise<T> };
const cache = new Map<string, CacheEntry<any>>();

function getCacheKey(kind: string, parts: any): string {
  return `${kind}:${typeof parts === 'string' ? parts : JSON.stringify(parts)}`;
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  const now = Date.now();
  if (existing && existing.expiresAt > now) {
    if (existing.value !== undefined) return existing.value as T;
    if (existing.promise) return existing.promise as Promise<T>;
  }

  const promise = fetcher().then((val) => {
    cache.set(key, { expiresAt: now + ttlMs, value: val });
    return val;
  }).catch((err) => {
    // On failure, set short-lived negative cache to avoid stampedes
    cache.set(key, { expiresAt: now + Math.min(5_000, ttlMs / 10) });
    throw err;
  });

  cache.set(key, { expiresAt: now + ttlMs, promise });
  return promise;
}

function isRateLimitError(error: unknown): boolean {
  const anyErr = error as any;
  const status = anyErr?.status || anyErr?.response?.status || anyErr?.details?.status;
  const msg: string = anyErr?.message || '';
  return status === 429 || /rate limit/i.test(msg);
}

function backoffMsFromError(error: unknown): number {
  // Default 30s; try to parse reset hint if present
  const anyErr = error as any;
  const msg: string = anyErr?.message || '';

  // Pattern: "retry after 19s"
  const retryAfterMatch = msg.match(/retry after\s+(\d+)s/i);
  if (retryAfterMatch && retryAfterMatch[1]) {
    const seconds = parseInt(retryAfterMatch[1], 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60_000); // cap at 60s
    }
  }

  // Pattern: "resets at Thu Nov 06 2025 ..."
  const resetsAtMatch = msg.match(/resets at\s+([^\n]+)/i);
  if (resetsAtMatch && resetsAtMatch[1]) {
    const when = Date.parse(resetsAtMatch[1].trim());
    if (!Number.isNaN(when)) {
      const delta = when - Date.now();
      if (delta > 0) return Math.min(delta, 120_000); // cap at 120s
    }
  }

  return 30_000;
}

export interface ScrapedContent {
  markdown?: string;
  html?: string;
  metadata?: Record<string, any>;
}

export interface SearchResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

export interface MapResult {
  links: Array<{ url: string; title?: string }>;
}

export interface CrawlResult {
  data: Array<{
    markdown?: string;
    html?: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Scrape a single website URL
 */
export async function scrapeWebsite(
  url: string,
  apiKey: string
): Promise<ScrapedContent> {
  try {
    if (Date.now() < firecrawlRateLimitedUntil) {
      return {};
    }
    const key = getCacheKey('scrape', url);
    return await cached<ScrapedContent>(key, 60 * 60 * 1000, async () => {
      await ensureWithinRateLimit();
      const client = new Firecrawl({ apiKey });
      const result = await client.scrape(url, {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
      });
      return result as ScrapedContent;
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(`[scrapeWebsite] Rate limited while scraping ${url}. Backing off.`, error);
      firecrawlRateLimitedUntil = Date.now() + backoffMsFromError(error);
      return {};
    }
    console.error(`[scrapeWebsite] Error scraping ${url}:`, error);
    throw error;
  }
}

/**
 * Search the web using Firecrawl search API
 */
export async function searchWeb(
  query: string,
  apiKey: string,
  options?: {
    limit?: number;
    sources?: Array<{ type: 'web' | 'news' | 'images' }>;
    scrapeOptions?: {
      formats?: Array<'markdown' | 'html'>;
    };
  }
): Promise<SearchResult[]> {
  try {
    if (Date.now() < firecrawlRateLimitedUntil) {
      return [];
    }
    const key = getCacheKey('search', { query, options });
    const searchResults = await cached<any>(key, 10 * 60 * 1000, async () => {
      await ensureWithinRateLimit();
      const client = new Firecrawl({ apiKey });
      return client.search(query, {
        limit: options?.limit ?? 5,
        sources: options?.sources ?? [{ type: 'web' }],
        scrapeOptions: options?.scrapeOptions ?? {
          formats: ['markdown'],
        },
      });
    });

    const results: SearchResult[] = [];
    
    // Handle different response shapes
    if (searchResults.data?.web) {
      for (const item of searchResults.data.web) {
        results.push({
          url: item.url || item.link || '',
          title: item.title || '',
          description: item.description || item.snippet,
          markdown: item.markdown,
        });
      }
    } else if (Array.isArray(searchResults.data)) {
      for (const item of searchResults.data) {
        results.push({
          url: item.url || item.link || '',
          title: item.title || '',
          description: item.description || item.snippet,
          markdown: item.markdown,
        });
      }
    }

    return results;
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(`[searchWeb] Rate limited for query "${query}". Backing off.`, error);
      firecrawlRateLimitedUntil = Date.now() + backoffMsFromError(error);
    } else {
      console.error(`[searchWeb] Error searching for "${query}":`, error);
    }
    // Return empty array on error rather than throwing
    return [];
  }
}

/**
 * Map/discover URLs on a website
 */
export async function mapWebsite(
  url: string,
  apiKey: string,
  options?: {
    search?: string;
    limit?: number;
  }
): Promise<MapResult> {
  try {
    const key = getCacheKey('map', { url, options });
    const result = await cached<any>(key, 30 * 60 * 1000, async () => {
      await ensureWithinRateLimit();
      const client = new Firecrawl({ apiKey });
      return client.map(url, {
        search: options?.search,
        limit: options?.limit ?? 50,
      });
    });

    return {
      links: result.links || [],
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(`[mapWebsite] Rate limited while mapping ${url}. Backing off.`, error);
      firecrawlRateLimitedUntil = Date.now() + backoffMsFromError(error);
      return { links: [] };
    }
    console.error(`[mapWebsite] Error mapping ${url}:`, error);
    // Return empty result on error
    return { links: [] };
  }
}

/**
 * Crawl a website with selective paths
 */
export async function crawlWebsite(
  url: string,
  apiKey: string,
  options?: {
    limit?: number;
    includePaths?: string[];
    excludePaths?: string[];
    scrapeOptions?: {
      formats?: Array<'markdown' | 'html'>;
    };
    pollInterval?: number;
    timeout?: number;
  }
): Promise<CrawlResult> {
  try {
    if (Date.now() < firecrawlRateLimitedUntil) {
      return { data: [] };
    }
    const key = getCacheKey('crawl', { url, options });
    const response = await cached<any>(key, 10 * 60 * 1000, async () => {
      await ensureWithinRateLimit();
      const client = new Firecrawl({ apiKey });
      return client.crawl(url, {
        limit: options?.limit ?? 20,
        includePaths: options?.includePaths,
        excludePaths: options?.excludePaths,
        scrapeOptions: options?.scrapeOptions ?? {
          formats: ['markdown', 'html'],
        },
        pollInterval: options?.pollInterval ?? 5000,
        timeout: options?.timeout ?? 300000,
      });
    });

    return {
      data: response.data || [],
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(`[crawlWebsite] Rate limited while crawling ${url}. Backing off.`, error);
      firecrawlRateLimitedUntil = Date.now() + backoffMsFromError(error);
    } else {
      console.error(`[crawlWebsite] Error crawling ${url}:`, error);
    }
    // Return empty result on error
    return { data: [] };
  }
}

