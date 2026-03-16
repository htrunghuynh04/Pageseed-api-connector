export type Strategy = 'mobile' | 'desktop';
export interface PageSpeedResult {
    performance_score: number;
    lcp: number;
    inp: number;
    cls: number;
    strategy: Strategy;
}
export interface PageSpeedError {
    error: 'rate_limited' | 'invalid_api_key' | 'url_unreachable' | 'parse_error' | 'unknown_error';
    message: string;
}
export type PageSpeedResponse = PageSpeedResult | PageSpeedError;
export declare function fetchPageSpeed(url: string, strategy: Strategy, apiKey: string): Promise<PageSpeedResponse>;
