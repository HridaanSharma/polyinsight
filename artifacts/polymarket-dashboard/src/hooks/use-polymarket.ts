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

// ── Build Claude prompt for a batch of markets ───────────────────────────────
function buildChainPrompt(batch: GammaMarket[], offset: number): string {
  const marketList = batch
    .map((m, i) => {
      const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
      const vol = parseFloat(m.volume24hr as any) || 0;
      return `${offset + i}. "${m.question}" | YES:${(yes * 100).toFixed(1)}% | 24hVol:$${(vol / 1000).toFixed(0)}K`;
    })
    .join("\n");

  return `You are a financial analyst looking at live prediction markets.

Here are active Polymarket markets right now:
${marketList}

Find 6-8 groups where markets from COMPLETELY DIFFERENT categories are causally linked in the real world.

STRICT RULES:
1. Each group MUST cross categories — conflict + economics, politics + policy, monetary + markets
2. The causal link must be DIRECT and OBVIOUS to a trader — not speculative or indirect
3. REJECT any group where the link is weak, far-fetched, or requires many steps
4. REJECT grouping sports games with geopolitics — these are not causally linked
5. REJECT grouping UFO/alien markets with anything — these are not financially correlated
6. REJECT putting same-topic markets together (all Iran together, all Bitcoin together)
7. sideA = the TRIGGER (the thing that happens first)
8. sideB = the REPRICING (markets that should move as a direct result)
9. Every index you use MUST exist in the list above (${offset}–${offset + batch.length - 1})

GOOD causal links:
- Fed holds rates → Bitcoin/risk assets drop (monetary policy directly affects crypto)
- Iran ceasefire → Oil drops (risk premium removed immediately)
- Democrats win Senate → Policy bills pass (direct legislative causation)
- Ukraine ceasefire → European energy prices drop (gas supply restored)
- Taiwan invasion → Semiconductor shortage (TSMC produces 90% of chips)

BAD causal links (NEVER do these):
- Any war → soccer matches (sports scheduling is not causally linked to wars)
- Iran conflict → Bitcoin (too indirect — many steps between)
- Geopolitical chaos → alien disclosure (completely unrelated)

Return ONLY a JSON array, no other text whatsoever:
[
  {
    "theme": "Specific Cause → Specific Effect",
    "emoji": "relevant emoji",
    "description": "One sentence: the direct mechanism connecting these markets",
    "sideA_label": "CAUSE",
    "sideA_indices": [${offset}, ${offset + 3}],
    "sideB_label": "EFFECT",
    "sideB_indices": [${offset + 12}, ${offset + 20}]
  }
]

Find as many VALID groups as the data supports. Quality over quantity.`;
}

// ── Parse one Claude response into CrossChain[] ───────────────────────────────
function parseChainsFromResponse(
  data: any,
  batch: GammaMarket[],
  offset: number
): CrossChain[] {
  try {
    const text: string = data?.content?.[0]?.text ?? "[]";
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return [];

    const aiChains: any[] = JSON.parse(clean.slice(start, end + 1));

    const results: CrossChain[] = [];
    for (const chain of aiChains) {
      const toChainMarket = (globalIdx: number): ChainMarket | null => {
        const localIdx = globalIdx - offset;
        const m = batch[localIdx];
        if (!m) return null;
        return enrichMarket(m);
      };

      const groupA: ChainMarket[] = (chain.sideA_indices || [])
        .filter((i: number) => i >= offset && i < offset + batch.length)
        .map(toChainMarket)
        .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

      const groupB: ChainMarket[] = (chain.sideB_indices || [])
        .filter((i: number) => i >= offset && i < offset + batch.length)
        .map(toChainMarket)
        .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

      if (groupA.length < 1 || groupB.length < 1) continue;

      // Reject chains where both sides share the same topic
      const topicsA = groupA.map(m => m.question.toLowerCase()).join(" ");
      const topicsB = groupB.map(m => m.question.toLowerCase()).join(" ");
      const SAME_TOPIC_WORDS = ["iran", "bitcoin", "trump", "ukraine", "fed rate", "interest rate"];
      let rejected = false;
      for (const word of SAME_TOPIC_WORDS) {
        if (topicsA.includes(word) && topicsB.includes(word)) { rejected = true; break; }
      }
      if (rejected) continue;

      const allMkts = [...groupA, ...groupB];
      const totalVolume = allMkts.reduce((s, m) => s + parseFloat((m.volume24hr || 0) as any), 0);

      results.push({
        theme: chain.theme || "Causal Chain",
        description: chain.description || "",
        emoji: chain.emoji || "🔗",
        groupALabel: chain.sideA_label || "CAUSE",
        groupBLabel: chain.sideB_label || "EFFECT",
        groupA,
        groupB,
        totalVolume,
        source: "ai" as const,
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ── Fetch AI-discovered chains from Claude (two parallel batches of 40) ───────
async function fetchAiChains(allMarkets: GammaMarket[]): Promise<CrossChain[]> {
  // Use ALL 500 markets sorted by 24h volume — no vol floor filter
  const sorted = [...allMarkets]
    .filter(m => {
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        return yes > 0.05 && yes < 0.95 && m.active && !m.closed;
      } catch { return false; }
    })
    .sort((a, b) => parseFloat(b.volume24hr as any) - parseFloat(a.volume24hr as any));

  const top80 = sorted.slice(0, 80);
  if (top80.length < 10) return [];

  const batch1 = top80.slice(0, 40);
  const batch2 = top80.slice(40, 80);

  const callClaude = async (batch: GammaMarket[], offset: number): Promise<CrossChain[]> => {
    const response = await fetch(`${BASE}/api/polymarket/claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 3000,
        messages: [{ role: "user", content: buildChainPrompt(batch, offset) }],
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (data.error) return [];
    return parseChainsFromResponse(data, batch, offset);
  };

  const [chains1, chains2] = await Promise.all([
    callClaude(batch1, 0),
    callClaude(batch2, 40),
  ]);

  // Combine, deduplicate by theme, sort by total volume
  const combined = [...chains1, ...chains2];
  const seen = new Set<string>();
  return combined
    .filter(c => {
      if (seen.has(c.theme)) return false;
      seen.add(c.theme);
      return true;
    })
    .sort((a, b) => b.totalVolume - a.totalVolume);
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

// ── Spread scanner — Phase 1: all 500 via Gamma, Phase 2: CLOB top 50 ────────
export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      // Phase 1: fetch all 500 markets via Gamma (5 pages in parallel)
      const pages = await Promise.all(
        [0, 100, 200, 300, 400].map(offset =>
          fetch(`${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`)
            .then(r => (r.ok ? r.json() : []))
        )
      );
      const allMarkets: GammaMarket[] = (pages.flat() as GammaMarket[])
        .filter(m => m.active === true && m.closed === false);

      // Filter candidates using Gamma bestBid/bestAsk for speed
      const candidates = allMarkets
        .filter(m => {
          const bid = parseFloat(m.bestBid as any);
          const ask = parseFloat(m.bestAsk as any);
          const vol = parseFloat(m.volume24hr as any);
          if (!bid || !ask) return false;
          if (bid < 0.05 || ask > 0.95) return false;
          if (vol < 1000) return false;
          return (ask - bid) > 0.01;
        })
        .sort((a, b) => {
          const spreadA = parseFloat(a.bestAsk as any) - parseFloat(a.bestBid as any);
          const spreadB = parseFloat(b.bestAsk as any) - parseFloat(b.bestBid as any);
          return spreadB - spreadA;
        })
        .slice(0, 50); // top 50 candidates by Gamma spread

      // Phase 2: verify top 50 with live CLOB in parallel
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
            if (spread < 0.01) return null;
            return { market: m, bestBid, bestAsk, spread };
          } catch {
            return null;
          }
        })
      );

      const valid = results
        .filter((r): r is SpreadData => r !== null)
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 30);

      // Fallback: use Gamma data if CLOB returns nothing
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
