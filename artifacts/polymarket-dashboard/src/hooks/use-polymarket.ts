import { useQuery } from "@tanstack/react-query";

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  url?: string;
  endDate: string;
  startDate?: string;
  volume: number;
  volume24hr: number;
  volumeClob: number;
  createdAt: string;
  active: boolean;
  closed: boolean;
  clobTokenIds: string | string[];
  outcomePrices: string;
  lastTradePrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  oneDayPriceChange?: number;
  priceChange?: number;
  eventSlug?: string;
  groupItemTitle?: string;
  events?: Array<{ id: string; slug: string; title?: string }>;
}

export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  volume: number;
  volume24hr: number;
  active: boolean;
  closed: boolean;
  markets: GammaMarket[];
  tags?: Array<{ id: string; label: string; slug: string }>;
}

export interface SpreadData {
  market: GammaMarket;
  bestBid: number;
  bestAsk: number;
  spread: number;
}

export interface ChainMarket extends GammaMarket {
  probability: number;
  moved: boolean;
  moveDirection: "up" | "down" | "flat";
  tradeUrl: string;
}

export interface CrossChain {
  theme: string;
  description: string;
  emoji: string;
  groupALabel: string;
  groupBLabel: string;
  groupA: ChainMarket[];
  groupB: ChainMarket[];
  totalVolume: number;
  source?: "keyword" | "ai";
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function parseClobTokenId(raw: string | string[]): string | null {
  try {
    if (Array.isArray(raw)) return raw[0] ?? null;
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  } catch {
    return null;
  }
}

// Use the event slug (not the market slug) for correct Polymarket URLs
function getTradeUrl(m: GammaMarket): string {
  const eventSlug = m.events?.[0]?.slug;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  return `https://polymarket.com/event/${m.slug}`;
}

// ── Filter & enrich a single market ──────────────────────────────────────────
function enrichMarket(m: GammaMarket): ChainMarket | null {
  try {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    if (yes <= 0.04 || yes >= 0.96) return null;
    if (parseFloat(m.volume24hr as any) < 5000) return null;
    const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any);
    return {
      ...m,
      probability: yes,
      moved: Math.abs(change) > 0.03,
      moveDirection: change > 0.03 ? "up" : change < -0.03 ? "down" : "flat",
      tradeUrl: getTradeUrl(m),
    };
  } catch {
    return null;
  }
}

// ── Fetch 500 markets from Gamma ─────────────────────────────────────────────
async function fetchAllMarkets(): Promise<GammaMarket[]> {
  const pages = await Promise.all(
    [0, 100, 200, 300, 400].map(offset =>
      fetch(
        `${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`
      ).then(r => (r.ok ? r.json() : []))
    )
  );
  return (pages.flat() as GammaMarket[]).filter(m => m.active === true && m.closed === false);
}

// ── Shared 500-market query (5 min refetch) ──────────────────────────────────
export function useAllMarkets() {
  return useQuery({
    queryKey: ["all-markets"],
    queryFn: fetchAllMarkets,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
}

// ── Fetch AI-discovered chains from Claude (fully dynamic) ───────────────────
async function fetchAiChains(allMarkets: GammaMarket[]): Promise<CrossChain[]> {
  // Filter to genuinely meaningful, uncertain markets
  const meaningful = allMarkets
    .filter(m => {
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        const vol24 = parseFloat(m.volume24hr as any) || 0;
        return yes > 0.05 && yes < 0.95 && vol24 > 10000 && m.active && !m.closed;
      } catch { return false; }
    })
    .sort((a, b) => parseFloat(b.volume24hr as any) - parseFloat(a.volume24hr as any));

  const top80 = meaningful.slice(0, 80);
  if (top80.length < 10) return [];

  const marketList = top80
    .map((m, i) => {
      const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
      const vol = parseFloat(m.volume24hr as any) || 0;
      const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any) || 0;
      return `${i}. "${m.question}" | YES:${(yes * 100).toFixed(1)}% | 24hVol:$${(vol / 1000).toFixed(0)}K | change:${(change * 100).toFixed(1)}%`;
    })
    .join("\n");

  const response = await fetch(`${BASE}/api/polymarket/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are analyzing ALL currently active Polymarket prediction markets.

Here are the top 80 markets by 24h volume right now:
${marketList}

Your job: find 6-8 groups of markets that are CAUSALLY CONNECTED across different topics.

The key rule: markets in the same group must be from DIFFERENT topics/categories but logically linked — if one moves, the others SHOULD reprice too but might not have yet.

Good examples of what we want:
- "US invades Iran" (conflict) + "Oil hits $100" (commodities) — invasion disrupts oil supply
- "Fed holds rates" (monetary) + "Recession by 2026" (economy) — high rates cause recession
- "Democrats win Senate" (politics) + "Climate bill passes" (policy) — Senate controls legislation
- "China invades Taiwan" (conflict) + "Nvidia stock drops" (tech) — Taiwan makes chips

Bad examples — do NOT do these:
- Grouping all Iran markets together — same topic
- Grouping all Fed rate markets together — same topic
- Grouping all Bitcoin price targets together — same topic

For each group:
- sideA = the CAUSE markets (the thing that triggers)
- sideB = the EFFECT markets (the thing that should reprice if sideA moves)
- Use ONLY index numbers from the list above (0-${top80.length - 1})
- Each side needs 2-5 markets minimum
- Groups must cross categories

Return ONLY valid JSON array, absolutely no other text:
[
  {
    "theme": "Cause → Effect (short, specific)",
    "emoji": "relevant emoji",
    "description": "One sentence: exactly why these markets move together",
    "sideA_label": "CAUSE CATEGORY NAME",
    "sideA_indices": [1, 4, 7],
    "sideB_label": "EFFECT CATEGORY NAME",
    "sideB_indices": [12, 23, 31]
  }
]`,
      }],
    }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  if (data.error) return [];

  try {
    const text: string = data?.content?.[0]?.text ?? "[]";
    // Strip markdown code fences if present
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return [];

    const aiChains: any[] = JSON.parse(clean.slice(start, end + 1));

    return aiChains
      .map(chain => {
        const toChainMarket = (idx: number): ChainMarket | null => {
          const m = top80[idx];
          if (!m) return null;
          return enrichMarket(m);
        };

        const groupA: ChainMarket[] = (chain.sideA_indices || [])
          .filter((i: number) => i >= 0 && i < top80.length)
          .map(toChainMarket)
          .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

        const groupB: ChainMarket[] = (chain.sideB_indices || [])
          .filter((i: number) => i >= 0 && i < top80.length)
          .map(toChainMarket)
          .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

        if (groupA.length < 1 || groupB.length < 1) return null;

        const allMkts = [...groupA, ...groupB];
        const totalVolume = allMkts.reduce((s, m) => s + parseFloat((m.volume24hr || 0) as any), 0);

        return {
          theme: chain.theme || "Causal Chain",
          description: chain.description || "",
          emoji: chain.emoji || "🔗",
          groupALabel: chain.sideA_label || "CAUSE",
          groupBLabel: chain.sideB_label || "EFFECT",
          groupA,
          groupB,
          totalVolume,
          source: "ai" as const,
        } satisfies CrossChain;
      })
      .filter((c): c is CrossChain => c !== null);
  } catch {
    return [];
  }
}

// ── Cross-category causal chains — fully AI-driven ───────────────────────────
export function useCausalChains() {
  const { data: allMarkets = [], isLoading: marketsLoading, error, refetch, isFetching } = useAllMarkets();

  // Claude discovers all chains dynamically. Cached 30 min — no hardcoded lists.
  const { data: chains = [], isLoading: aiLoading } = useQuery({
    queryKey: ["ai-chains-v2", allMarkets.length > 0 ? allMarkets[0]?.id : "empty"],
    queryFn: () => fetchAiChains(allMarkets),
    enabled: allMarkets.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const sorted = [...chains].sort((a, b) => b.totalVolume - a.totalVolume);

  return {
    chains: sorted,
    isLoading: marketsLoading,
    aiLoading,
    error,
    refetch,
    isFetching,
  };
}

// ── 500-market set for Volume Spikes ─────────────────────────────────────────
export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const pages = await Promise.all(
        [0, 100, 200, 300, 400].map(offset =>
          fetch(`${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`)
            .then(r => (r.ok ? r.json() : []))
        )
      );
      return (pages.flat() as GammaMarket[]).filter(m => m.active === true && m.closed === false);
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
}

// ── Spread scanner (CLOB + Gamma fallback) ───────────────────────────────────
export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      const [p1, p2] = await Promise.all([
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=30&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=130&active=true&closed=false&order=volume24hr&ascending=false`),
      ]);
      if (!p1.ok) throw new Error("Failed to fetch markets");
      const [r1, r2] = await Promise.all([
        p1.json(),
        p2.ok ? p2.json() : Promise.resolve([]),
      ]);
      const allMarkets: GammaMarket[] = [...r1, ...r2];
      const now = Date.now();

      const candidates = allMarkets.filter(m => {
        if (!m.active || m.closed) return false;
        const bid = parseFloat(m.bestBid as any);
        const ask = parseFloat(m.bestAsk as any);
        const vol = parseFloat(m.volume24hr as any);
        const endsAt = m.endDate ? new Date(m.endDate).getTime() : Infinity;
        return bid > 0.03 && ask < 0.97 && vol > 2000 && endsAt > now;
      });

      const results = await Promise.all(
        candidates.map(async m => {
          try {
            const tokenId = parseClobTokenId(m.clobTokenIds);
            if (!tokenId) return null;
            const bookRes = await fetch(`${BASE}/api/polymarket/book?token_id=${tokenId}`);
            if (!bookRes.ok) return null;
            const book = await bookRes.json();
            if (!book.bids?.length || !book.asks?.length) return null;
            const bestBid = parseFloat(book.bids[0].price);
            const bestAsk = parseFloat(book.asks[0].price);
            const spread = bestAsk - bestBid;
            if (bestBid < 0.05 || bestAsk > 0.95) return null;
            if (spread < 0.02 || spread > 0.40) return null;
            return { market: m, bestBid, bestAsk, spread };
          } catch {
            return null;
          }
        })
      );

      const valid = results
        .filter((r): r is SpreadData => r !== null)
        .filter(r => parseFloat(r.market.volume24hr as any) > 2000)
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 30);

      if (valid.length === 0) {
        return candidates
          .map(m => ({
            market: m,
            bestBid: parseFloat(m.bestBid as any),
            bestAsk: parseFloat(m.bestAsk as any),
            spread: parseFloat(m.bestAsk as any) - parseFloat(m.bestBid as any),
          }))
          .filter(d => d.spread > 0.01 && d.bestBid > 0.05 && d.bestAsk < 0.95)
          .sort((a, b) => b.spread - a.spread)
          .slice(0, 30);
      }

      return valid;
    },
    refetchInterval: 60000,
  });
}
