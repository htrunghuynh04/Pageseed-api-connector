import axios, { AxiosError } from 'axios';
import { Strategy } from './fetchPageSpeed.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrUXResult {
  lcp: number | null;   // seconds (p75)
  inp: number | null;   // milliseconds (p75)
  cls: number | null;   // unitless (p75)
  fcp: number | null;   // seconds (p75)
  ttfb: number | null;  // milliseconds (p75)
  strategy: Strategy;
}

export interface CrUXError {
  error: 'not_enough_data' | 'url_not_found' | 'invalid_api_key' | 'unknown_error';
  message: string;
}

export type CrUXResponse = CrUXResult | CrUXError;

// ── Constants ─────────────────────────────────────────────────────────────────

const CRUX_API = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

// ── Helpers ───────────────────────────────────────────────────────────────────

function p75(metric: any): number | null {
  const val = metric?.percentiles?.p75;
  return typeof val === 'number' ? val : null;
}

function toSeconds(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100;
}

// ── Main fetch function ───────────────────────────────────────────────────────

export async function fetchCrUX(
  url: string,
  strategy: Strategy,
  apiKey: string
): Promise<CrUXResponse> {
  const formFactor = strategy === 'mobile' ? 'PHONE' : 'DESKTOP';

  try {
    const response = await axios.post(
      `${CRUX_API}?key=${apiKey}`,
      { url, formFactor },
      { timeout: 30000 }
    );

    const metrics = response.data?.record?.metrics;
    if (!metrics) {
      return { error: 'not_enough_data', message: 'No CrUX data available for this URL.' };
    }

    const lcpRaw = p75(metrics['largest_contentful_paint']);
    const inpRaw = p75(metrics['interaction_to_next_paint']);
    const clsRaw = p75(metrics['cumulative_layout_shift']);
    const fcpRaw = p75(metrics['first_contentful_paint']);
    const ttfbRaw = p75(metrics['experimental_time_to_first_byte']);

    return {
      lcp: lcpRaw !== null ? toSeconds(lcpRaw) : null,
      inp: inpRaw !== null ? Math.round(inpRaw) : null,
      cls: clsRaw !== null ? Math.round(clsRaw * 1000) / 1000 : null,
      fcp: fcpRaw !== null ? toSeconds(fcpRaw) : null,
      ttfb: ttfbRaw !== null ? Math.round(ttfbRaw) : null,
      strategy,
    };
  } catch (err) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;

    if (status === 404) {
      return { error: 'url_not_found', message: 'No CrUX data found for this URL. The page may have too little traffic.' };
    }
    if (status === 400 || status === 403) {
      return { error: 'invalid_api_key', message: 'API key is invalid or missing CrUX API access (HTTP ' + status + ').' };
    }

    return { error: 'unknown_error', message: axiosErr.message ?? 'Unknown error' };
  }
}
