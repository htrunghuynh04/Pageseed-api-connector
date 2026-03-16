import axios, { AxiosError } from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Strategy = 'mobile' | 'desktop';

export interface PageSpeedResult {
  performance_score: number;
  lcp: number;   // seconds
  inp: number;   // milliseconds
  cls: number;   // unitless
  strategy: Strategy;
}

export interface PageSpeedError {
  error: 'rate_limited' | 'invalid_api_key' | 'url_unreachable' | 'parse_error' | 'unknown_error';
  message: string;
}

export type PageSpeedResponse = PageSpeedResult | PageSpeedError;

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TIMEOUT_MS = 60000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractNumeric(audits: Record<string, any>, key: string): number | null {
  const val = audits?.[key]?.numericValue;
  return typeof val === 'number' ? val : null;
}

function toSeconds(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100;
}

function classifyHttpError(status: number): PageSpeedError {
  if (status === 429) {
    return { error: 'rate_limited', message: 'Google PageSpeed API rate limit reached (HTTP 429). Try again later or use a different API key.' };
  }
  if (status === 400 || status === 403) {
    return { error: 'invalid_api_key', message: 'API key is invalid or does not have access to PageSpeed Insights API (HTTP ' + status + ').' };
  }
  if (status === 404 || status === 503) {
    return { error: 'url_unreachable', message: 'The target URL could not be reached or returned an error (HTTP ' + status + ').' };
  }
  return { error: 'unknown_error', message: 'Unexpected HTTP error: ' + status };
}

// ── Main fetch function ───────────────────────────────────────────────────────

export async function fetchPageSpeed(
  url: string,
  strategy: Strategy,
  apiKey: string
): Promise<PageSpeedResponse> {
  let response: any;

  try {
    response = await axios.get(PAGESPEED_API, {
      timeout: TIMEOUT_MS,
      params: {
        url,
        strategy: strategy.toUpperCase(),
        key: apiKey,
        category: 'performance',
      },
    });
  } catch (err) {
    const axiosErr = err as AxiosError;

    if (axiosErr.response) {
      return classifyHttpError(axiosErr.response.status);
    }

    // Network-level errors (DNS failure, connection refused, timeout)
    const msg = axiosErr.message?.toLowerCase() ?? '';
    if (
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('network')
    ) {
      return {
        error: 'url_unreachable',
        message: 'Could not connect to the PageSpeed API or the target URL is unreachable: ' + axiosErr.message,
      };
    }

    return { error: 'unknown_error', message: axiosErr.message ?? 'Unknown error' };
  }

  // ── Parse response ──────────────────────────────────────────────────────────
  try {
    const data = response.data;
    const categories = data?.lighthouseResult?.categories;
    const audits = data?.lighthouseResult?.audits;

    if (!categories || !audits) {
      return { error: 'parse_error', message: 'PageSpeed API returned an unexpected response structure.' };
    }

    const performanceScore = categories?.performance?.score;
    if (typeof performanceScore !== 'number') {
      return { error: 'parse_error', message: 'Could not extract performance score from API response.' };
    }

    const lcpRaw = extractNumeric(audits, 'largest-contentful-paint');
    const inpRaw = extractNumeric(audits, 'interaction-to-next-paint') ?? extractNumeric(audits, 'experimental-interaction-to-next-paint');
    const clsRaw = extractNumeric(audits, 'cumulative-layout-shift');

    if (lcpRaw === null || inpRaw === null || clsRaw === null) {
      return { error: 'parse_error', message: 'One or more Core Web Vitals metrics missing from API response.' };
    }

    return {
      performance_score: Math.round(performanceScore * 100),
      lcp: toSeconds(lcpRaw),
      inp: Math.round(inpRaw),
      cls: Math.round(clsRaw * 1000) / 1000,
      strategy,
    };
  } catch (parseErr) {
    return {
      error: 'parse_error',
      message: 'Failed to parse PageSpeed API response: ' + String(parseErr),
    };
  }
}
