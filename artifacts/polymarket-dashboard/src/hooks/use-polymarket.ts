import { useQuery, useQueryClient } from "@tanstack/react-query";

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

  return `You are a senior macro trader analyzing live prediction markets for causal mispricings.

Here are active Polymarket markets right now:
${marketList}

Find groups where markets from COMPLETELY DIFFERENT topics are causally connected — meaning if one market moves, the other should logically reprice but may not have yet.

STRICT RULES — read every single one:

1. MUST cross completely different topics. Examples of valid crosses:
   - Military conflict + commodity prices (invasion disrupts supply)
   - Central bank policy + asset prices (rates affect valuations)
   - Election outcome + legislation (who wins determines what passes)
   - Trade policy + economic indicators (tariffs affect GDP)
   - Geopolitical event + diplomatic relations (war ends diplomacy)
   - Leadership change + regional stability (new leader changes policy)

2. The causal mechanism must be DIRECT — one step, not three steps.
   "A causes B" is valid. "A causes C which causes D which affects B" is NOT valid.

3. NEVER group these together — they are always invalid:
   - Sports games with ANYTHING (soccer, basketball, hockey are self-contained)
   - UFO/alien markets with ANYTHING
   - Tweet counting markets with ANYTHING
   - Bitcoin price targets with Iran conflict (too indirect)
   - Bitcoin price targets with Bitcoin price targets (same topic)
   - Iran markets with Iran markets (same topic)
   - Oil price targets with oil price targets (same topic)
   - Fed rate markets with Fed rate markets (same topic)

4. Bitcoin is ONLY valid on the EFFECT side when paired with:
   - Fed rate decisions (direct: rates affect risk assets)
   - US debt ceiling/default (direct: dollar crisis affects crypto)
   - Never with geopolitical conflicts

5. Oil is ONLY valid on the EFFECT side when paired with:
   - Iran/Hormuz conflict markets (direct: disrupts supply)
   - Ukraine/Russia ceasefire (direct: restores energy supply)
   - Never pair oil with oil

6. Each group needs minimum 2 markets on EACH side

7. Every index must exist in the list above (${offset}–${offset + batch.length - 1}) — double check before returning

8. Find as many valid groups as the data supports — aim for 8-12 if the data allows

Return ONLY valid JSON, no other text, no markdown:
[
  {
    "theme": "Specific Cause → Specific Effect",
    "emoji": "single relevant emoji",
    "description": "One sentence explaining the direct real-world mechanism",
    "sideA_label": "CAUSE LABEL IN CAPS",
    "sideA_indices": [${offset}, ${offset + 3}],
    "sideB_label": "EFFECT LABEL IN CAPS",
    "sideB_indices": [${offset + 12}, ${offset + 20}]
  }
]`;
}

// ── Post-filter one Claude chain response ─────────────────────────────────────
function filterChain(
  chain: any,
  batch: GammaMarket[],
  offset: number
): CrossChain | null {
  const toChainMarket = (globalIdx: number): ChainMarket | null => {
    const m = batch[globalIdx - offset];
    return m ? enrichMarket(m) : null;
  };

  const groupA: ChainMarket[] = (chain.sideA_indices || [])
    .filter((i: number) => i >= offset && i < offset + batch.length)
    .map(toChainMarket)
    .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

  const groupB: ChainMarket[] = (chain.sideB_indices || [])
    .filter((i: number) => i >= offset && i < offset + batch.length)
    .map(toChainMarket)
    .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

  // Need at least 2 on each side
  if (groupA.length < 2 || groupB.length < 2) return null;

  const textA = groupA.map(m => m.question.toLowerCase()).join(" ");
  const textB = groupB.map(m => m.question.toLowerCase()).join(" ");
  const allText = textA + " " + textB;

  // Hard reject: sports on either side
  const SPORTS_KW = [" vs ", " vs. ", " @ ", "win on 202", "nba", "nfl", "nhl", "mlb",
    "soccer", "football match", "basketball", "hockey game", "champions league",
    "premier league", "world cup", "super bowl"];
  if (SPORTS_KW.some(kw => allText.includes(kw))) return null;

  // Hard reject: alien/UFO markets
  if (allText.includes("alien") || allText.includes("ufo") || allText.includes("non-human")) return null;

  // Hard reject: tweet-counting markets
  if (allText.includes("tweets from") || allText.includes("post 2") ||
    allText.includes("post 3") || allText.includes("post 4")) return null;

  // Hard reject: same topic on both sides
  const SAME_TOPIC_PAIRS: [string, string][] = [
    ["iran", "iran"], ["bitcoin", "bitcoin"], ["btc", "btc"],
    ["oil", "oil"], ["crude", "crude"], ["fed ", "fed "],
    ["interest rate", "interest rate"], ["israel", "israel"],
    ["ukraine", "ukraine"], ["taiwan", "taiwan"],
    ["election", "election"], ["trump", "trump"],
  ];
  for (const [kA, kB] of SAME_TOPIC_PAIRS) {
    if (textA.includes(kA) && textB.includes(kB)) return null;
  }

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
  };
}

// ── Parse Claude response → CrossChain[] ─────────────────────────────────────
function parseChainsFromResponse(data: any, batch: GammaMarket[], offset: number): CrossChain[] {
  try {
    const text: string = data?.content?.[0]?.text ?? "[]";
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    const aiChains: any[] = JSON.parse(clean.slice(start, end + 1));
    return aiChains.map(c => filterChain(c, batch, offset)).filter((c): c is CrossChain => c !== null);
  } catch {
    return [];
  }
}

// ── Fetch AI chains: 4 parallel batches of 50 from top 200 markets ────────────
async function fetchAiChains(allMarkets: GammaMarket[]): Promise<CrossChain[]> {
  // Filter to uncertain, active markets with real volume (lower floor = more variety)
  const sorted = [...allMarkets]
    .filter(m => {
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        const vol24 = parseFloat(m.volume24hr as any) || 0;
        return yes > 0.05 && yes < 0.95 && vol24 > 5000 && m.active && !m.closed;
      } catch { return false; }
    })
    .sort((a, b) => parseFloat(b.volume24hr as any) - parseFloat(a.volume24hr as any));

  const top200 = sorted.slice(0, 200);
  if (top200.length < 20) return [];

  const callClaude = async (batch: GammaMarket[], offset: number): Promise<CrossChain[]> => {
    const response = await fetch(`${BASE}/api/polymarket/claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: buildChainPrompt(batch, offset) }],
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (data.error) return [];
    return parseChainsFromResponse(data, batch, offset);
  };

  // 4 batches of 50 in parallel
  const [c1, c2, c3, c4] = await Promise.all([
    callClaude(top200.slice(0, 50), 0),
    callClaude(top200.slice(50, 100), 50),
    callClaude(top200.slice(100, 150), 100),
    callClaude(top200.slice(150, 200), 150),
  ]);

  // Deduplicate by theme, then by sideA market set, sort by volume, cap at 20
  const combined = [...c1, ...c2, ...c3, ...c4];
  const seenThemes = new Set<string>();
  const seenSideA = new Set<string>();

  return combined
    .filter(c => {
      if (seenThemes.has(c.theme)) return false;
      seenThemes.add(c.theme);
      const sideAKey = c.groupA.map(m => m.conditionId).sort().join(",");
      if (seenSideA.has(sideAKey)) return false;
      seenSideA.add(sideAKey);
      return true;
    })
    .sort((a, b) => b.totalVolume - a.totalVolume)
    .slice(0, 20);
}

// ── Cross-category causal chains — fully AI-driven ───────────────────────────
export function useCausalChains() {
  const qc = useQueryClient();
  const { data: allMarkets = [], isLoading: marketsLoading, error, refetch: refetchMarkets, isFetching } = useAllMarkets();

  // Claude discovers all chains dynamically. Cached 30 min — no hardcoded lists.
  const { data: chains = [], isLoading: aiLoading } = useQuery({
    queryKey: ["ai-chains-v2", allMarkets.length > 0 ? allMarkets[0]?.id : "empty"],
    queryFn: () => fetchAiChains(allMarkets),
    enabled: allMarkets.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Refresh: get fresh markets from Gamma, then force Claude to re-analyze
  const refetch = async () => {
    await refetchMarkets();
    // Invalidate AI chains so Claude runs again with the new market data
    await qc.invalidateQueries({ queryKey: ["ai-chains-v2"] });
  };

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
