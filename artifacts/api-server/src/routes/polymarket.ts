import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

async function proxyGet(url: string, res: any) {
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `Upstream error: ${response.status}` });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Proxy error" });
  }
}

async function clobGet(url: string, res: any) {
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; PolymarketDashboard/1.0)",
      },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `CLOB error: ${response.status}` });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "CLOB proxy error" });
  }
}

router.get("/polymarket/events", async (req, res) => {
  const limit = req.query.limit ?? 50;
  const offset = req.query.offset ?? 0;
  const active = req.query.active ?? "true";
  const closed = req.query.closed ?? "false";
  const order = req.query.order ?? "volume24hr";
  const ascending = req.query.ascending ?? "false";
  await proxyGet(`${GAMMA_BASE}/events?limit=${limit}&offset=${offset}&active=${active}&closed=${closed}&order=${order}&ascending=${ascending}`, res);
});

router.get("/polymarket/markets", async (req, res) => {
  const limit = req.query.limit ?? 100;
  const offset = req.query.offset ?? 0;
  const active = req.query.active ?? "true";
  const closed = req.query.closed ?? "false";
  const order = req.query.order ?? "volume24hr";
  const ascending = req.query.ascending ?? "false";
  await proxyGet(`${GAMMA_BASE}/markets?limit=${limit}&offset=${offset}&active=${active}&closed=${closed}&order=${order}&ascending=${ascending}`, res);
});

router.get("/polymarket/book", async (req, res) => {
  const tokenId = req.query.token_id;
  if (!tokenId) {
    res.status(400).json({ error: "token_id is required" });
    return;
  }
  await clobGet(`${CLOB_BASE}/book?token_id=${tokenId}`, res);
});

router.get("/polymarket/prices-history", async (req, res) => {
  const market = req.query.market;
  const interval = req.query.interval ?? "1h";
  if (!market) {
    res.status(400).json({ error: "market is required" });
    return;
  }
  await proxyGet(`${CLOB_BASE}/prices-history?market=${market}&interval=${interval}`, res);
});

// ── Correlation pairs cache (10-minute TTL) ──────────────────────────────────
let correlationCache: { pairs: any[]; ts: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchGammaMarkets(offset: number, limit: number) {
  const r = await fetch(
    `${GAMMA_BASE}/markets?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume24hr&ascending=false`,
    { headers: { Accept: "application/json" } }
  );
  return r.ok ? r.json() : [];
}

router.get("/polymarket/correlations", async (req, res) => {
  if (correlationCache && Date.now() - correlationCache.ts < CACHE_TTL_MS) {
    res.json(correlationCache.pairs);
    return;
  }

  const anthropicBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!anthropicBase || !anthropicKey) {
    res.status(503).json({ error: "Anthropic integration not configured" });
    return;
  }

  try {
    const [p1, p2, p3] = await Promise.all([
      fetchGammaMarkets(0, 50),
      fetchGammaMarkets(50, 50),
      fetchGammaMarkets(100, 50),
    ]);
    const allMarkets: any[] = [...p1, ...p2, ...p3];

    const SKIP_KW = [" vs ", " vs. ", " @ ", "tweets", "tweet", "o/u ", "over/under", "-0.5", "-1.5", "-2.5", "win the nba", "win the nfl", "win the nhl", "win the mlb", "ncaa tournament", "drivers champion", "eurovision"];

    const filtered = allMarkets.filter(m => {
      if (!m.active || m.closed) return false;
      const q = (m.question || "").toLowerCase();
      if (SKIP_KW.some(kw => q.includes(kw))) return false;
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        return yes > 0.08 && yes < 0.92 && parseFloat(m.volume24hr || 0) > 50000;
      } catch { return false; }
    });

    const BATCH_SIZE = 30;
    const batches: any[][] = [];
    for (let i = 0; i < Math.min(filtered.length, 150); i += BATCH_SIZE) {
      batches.push(filtered.slice(i, i + BATCH_SIZE));
    }

    async function analyzeBatch(batch: any[]): Promise<any[]> {
      const lines = batch.map((m, i) => {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        const eventSlug = m.events?.[0]?.slug || m.slug;
        return `${i}: "${m.question}" — ${(yes * 100).toFixed(1)}% YES [event:${eventSlug}]`;
      }).join("\n");

      const resp = await fetch(`${anthropicBase}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 8192,
          messages: [{
            role: "user",
            content: `You are analyzing prediction market prices for logical inconsistencies.

Markets with their current YES probabilities:
${lines}

Find pairs from DIFFERENT events where the prices appear logically inconsistent.

Good examples:
- "Will Fed cut rates?" at 5% AND "Will inflation stay above 3%?" at 80% — high inflation means no cut, so these are consistent actually
- "Will US invade Iran?" at 45% AND "Will oil hit $120?" at 11% — invasion would spike oil, seems underpriced
- "Will Trump sign tariff bill?" at 70% AND "Will China GDP grow 5%?" at 60% — tariffs hurt Chinese growth, may be inconsistent

Skip pairs from the same event slug. Skip sports/games pairs. Skip tweet-counting markets.

Return ONLY a valid JSON array, no other text:
[
  {
    "market1_index": 0,
    "market2_index": 5,
    "relationship": "One sentence: how these markets are logically connected",
    "inconsistency": "One sentence: why their current prices seem inconsistent",
    "direction": "market2_underpriced"
  }
]

Only include genuinely interesting and significant mispricings. Max 5 pairs. Return [] if none found.`,
          }],
        }),
      });

      const data = await resp.json();
      const text: string = data?.content?.[0]?.text ?? "[]";
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start === -1 || end === -1) return [];

      const raw: any[] = JSON.parse(text.slice(start, end + 1));
      return raw
        .filter(p => batch[p.market1_index] && batch[p.market2_index])
        .map(p => {
          const m1 = batch[p.market1_index];
          const m2 = batch[p.market2_index];
          return {
            market1: {
              question: m1.question,
              slug: m1.slug,
              probability: parseFloat(JSON.parse(m1.outcomePrices || '["0.5"]')[0]),
              volume24hr: parseFloat(m1.volume24hr || 0),
              eventSlug: m1.events?.[0]?.slug || m1.slug,
            },
            market2: {
              question: m2.question,
              slug: m2.slug,
              probability: parseFloat(JSON.parse(m2.outcomePrices || '["0.5"]')[0]),
              volume24hr: parseFloat(m2.volume24hr || 0),
              eventSlug: m2.events?.[0]?.slug || m2.slug,
            },
            relationship: p.relationship,
            inconsistency: p.inconsistency,
            direction: p.direction ?? "unknown",
          };
        })
        .filter(p => p.market1.eventSlug !== p.market2.eventSlug);
    }

    const batchResults = await Promise.all(batches.map(analyzeBatch));
    const pairs = batchResults.flat().slice(0, 20);

    correlationCache = { pairs, ts: Date.now() };
    res.json(pairs);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Correlation analysis failed" });
  }
});

// ── Claude proxy for dynamic chain discovery ─────────────────────────────────
router.post("/polymarket/claude", async (req, res) => {
  // Prefer user's own key with direct Anthropic API.
  // Fall back to Replit AI integration proxy if available.
  const directKey = process.env.ANTHROPIC_API_KEY;
  const replitKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const replitBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

  const apiKey = directKey || replitKey;
  const baseUrl = directKey
    ? "https://api.anthropic.com"
    : (replitBase || "https://api.anthropic.com");

  if (!apiKey) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Claude proxy error" });
  }
});

export default router;
