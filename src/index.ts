import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { fetchPageSpeed, PageSpeedResult, PageSpeedError } from './fetchPageSpeed.js';

// ── Factory: create a new McpServer per connection ────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: 'pagespeed-mcp',
    version: '1.0.0',
  });

  server.tool(
    'getPageSpeed',
    'Call Google PageSpeed Insights API to get Core Web Vitals and Performance Score for a URL. ' +
    'Returns performance_score (0-100), LCP in seconds, INP in ms, and CLS. ' +
    'Call twice per URL — once with strategy=mobile and once with strategy=desktop — then combine into a comparison table. ' +
    'If any error is returned, do NOT hallucinate scores. Report the error clearly and direct the user to pagespeed.web.dev for manual measurement.',
    {
      url: z.string().url('Must be a valid URL including https://'),
      strategy: z.enum(['mobile', 'desktop']),
      api_key: z.string().min(1, 'API key is required'),
    },
    async ({ url, strategy, api_key }) => {
      console.error(`[PageSpeed] Fetching ${strategy} scores for: ${url}`);

      const result = await fetchPageSpeed(url, strategy, api_key);

      if ('error' in result) {
        const err = result as PageSpeedError;
        console.error(`[PageSpeed] Error: ${err.error} — ${err.message}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err.error,
              message: err.message,
              fallback_instruction: 'PageSpeed API is unavailable. Please measure manually at https://pagespeed.web.dev and record N/A — Manual check required in the report.',
            }, null, 2),
          }],
          isError: true,
        };
      }

      const data = result as PageSpeedResult;
      console.error(`[PageSpeed] Success — score: ${data.performance_score}, LCP: ${data.lcp}s, INP: ${data.inp}ms, CLS: ${data.cls}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            performance_score: data.performance_score,
            lcp: data.lcp,
            inp: data.inp,
            cls: data.cls,
            fcp: data.fcp,
            ttfb: data.ttfb,
            strategy: data.strategy,
          }, null, 2),
        }],
      };
    }
  );

  return server;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001');
const MODE = process.env.MODE ?? 'both';
const ENABLE_CORS = process.env.ENABLE_CORS === 'true';

app.use(express.json());
if (ENABLE_CORS) {
  app.use(cors());
  console.error('🔓 CORS enabled');
} else {
  console.error('🔒 CORS disabled (set ENABLE_CORS=true to enable)');
}

// ── SSE transport ─────────────────────────────────────────────────────────────

if (MODE === 'sse' || MODE === 'both' || MODE === 'http') {
  const sseTransports: Record<string, SSEServerTransport> = {};

  app.get('/sse', async (_req, res) => {
    console.error('[SSE] New connection');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const transport = new SSEServerTransport('/messages', res);
    sseTransports[transport.sessionId] = transport;

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(keepAlive);
      delete sseTransports[transport.sessionId];
      console.error(`[SSE] Connection closed: ${transport.sessionId}`);
    });
    await createServer().connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = sseTransports[sessionId];
    if (!transport) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }
    await transport.handlePostMessage(req, res);
  });
}

// ── Streamable HTTP transport ─────────────────────────────────────────────────

if (MODE === 'streamable' || MODE === 'both') {
  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST' && !sessionId) {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await createServer().connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.status(400).json({ error: 'Bad Request: No valid session ID provided' });
  });
}

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ status: 'ok', server: 'pagespeed-mcp', version: '1.0.0' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.error(`✅ PageSpeed MCP server running on port ${PORT}`);
  console.error(`🌐 SSE endpoint: http://localhost:${PORT}/sse`);
  console.error(`🏥 Health check: http://localhost:${PORT}/health`);
});
