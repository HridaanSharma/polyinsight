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
      const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any) || 0;
      return `${offset + i}. "${m.question}" | YES:${(yes * 100).toFixed(1)}% | Vol:$${(vol / 1000).toFixed(0)}K | 24hChange:${(change * 100).toFixed(1)}%`;
    })
    .join("\n");

  return `You are a senior macro trader and political analyst. You are looking at LIVE Polymarket prediction markets.

Here are ${batch.length} active markets (indices ${offset}–${offset + batch.length - 1}):
${marketList}

YOUR TASK: Find pairs or groups of markets from COMPLETELY DIFFERENT topics that are causally connected. A trader betting on one of these should ALSO be looking at the other.

=== WHAT WE WANT: CROSS-TOPIC CAUSAL CHAINS ===

The value is finding markets from different sections of Polymarket that move together in real life but are listed separately on the platform. A trader seeing only one side is missing the full picture.

=== MANY EXAMPLES OF VALID CHAINS ===

CONFLICT → COMMODITY:
- "US invades Iran" + "Crude oil hits $100" → invasion disrupts Hormuz, oil spikes immediately
- "Iran ceasefire signed" + "Crude oil below $80" → ceasefire removes risk premium, oil drops
- "Ukraine ceasefire" + "European natural gas below $X" → war end restores pipeline supply
- "Israel attacks Lebanon" + "Oil above $100" → Middle East escalation = supply fear

MONETARY POLICY → ASSET PRICES:
- "Fed holds rates in April" + "Bitcoin dips to $X" → high rates = risk-off = crypto sells
- "Fed cuts rates" + "Bitcoin reaches $X" → rate cuts = risk-on = crypto rallies
- "Fed holds rates" + "S&P500 drops" → tight policy pressures equities
- "US inflation above 3%" + "Fed cuts rates" → these are logically inconsistent if both high

POLITICS → POLICY OUTCOMES:
- "Democrats win Senate majority" + "Climate bill passes" → need Senate to pass legislation
- "Republicans win House" + "Tax cuts extended" → house controls budget legislation
- "Trump wins election" + "US rejoins Paris Agreement" → opposite directions
- "Democrats win Senate" + "Minimum wage increase" → direct legislative path

TRADE POLICY → ECONOMICS:
- "Trump imposes 25% tariffs on China" + "China GDP growth below 4%" → tariffs directly hurt Chinese exports
- "Trump tariffs on EU" + "Euro weakens against dollar" → trade war = currency pressure
- "US trade war escalates" + "Recession by 2026" → trade disruption = economic slowdown

GEOPOLITICAL → DIPLOMATIC:
- "China invades Taiwan" + "Trump visits China" → invasion makes diplomatic visit impossible
- "Iran regime falls" + "Netanyahu survives politically" → Iran collapse removes his main threat
- "Russia-Ukraine ceasefire" + "NATO expands" → peace changes alliance dynamics
- "North Korea nuclear test" + "US-China relations improve" → shared threat can unite rivals

LEADERSHIP → MARKET:
- "Putin leaves power" + "Ukraine ceasefire" → new Russian leader might negotiate
- "Netanyahu removed" + "Israel-Gaza ceasefire" → leadership change enables deal
- "Iran leadership change" + "Iran nuclear deal" → new leader could reopen negotiations

FINANCIAL CONTAGION:
- "US debt ceiling crisis" + "Dollar index drops" → default fear weakens dollar
- "US government shutdown" + "S&P500 drops" → shutdown = economic uncertainty
- "Argentina defaults" + "Emerging market ETF drops" → contagion effect

=== WHAT TO ABSOLUTELY NEVER DO ===

NEVER group these — they are always wrong:
- Sports games (basketball, soccer, hockey, baseball) with ANYTHING political or financial
- Elon Musk tweet counting with ANYTHING
- Eurovision/F1/sports championships with geopolitics
- UFO/alien disclosure with anything
- Multiple Bitcoin price targets together (same topic)
- Multiple Iran markets together (same topic)
- Multiple Fed rate markets together (same topic)
- Multiple oil price targets together (same topic)
- "Iran conflict" + "Bitcoin" — too many steps between them, not direct
- "War" + "stock market" — too vague, not a direct single-step mechanism

=== VALIDATION CHECKLIST ===
Before including any group, verify:
✓ Are the two sides from genuinely different topics? (conflict ≠ commodity ≠ politics ≠ policy)
✓ Is there ONE direct real-world mechanism connecting them?
✓ Would a trader on side A DIRECTLY care about side B?
✓ Are ALL indices valid numbers that exist in the list above (${offset}–${offset + batch.length - 1})?
✓ Does each side have at least 2 markets?

Return ONLY a JSON array. No explanation. No markdown. No extra text. Just the JSON:
[
  {
    "theme": "Specific Cause → Specific Direct Effect",
    "emoji": "one relevant emoji",
    "description": "One sentence: the exact real-world mechanism",
    "sideA_label": "CAUSE IN CAPS (3-4 words)",
    "sideA_indices": [${offset}, ${offset + 3}],
    "sideB_label": "EFFECT IN CAPS (3-4 words)",
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
  const SPORTS_KW = [" vs ", " vs. ", " @ ", "win on 2026", "win on 2025", "nba", "nfl",
    "nhl", "mlb", "soccer", "football match", "basketball", "hockey game",
    "champions league", "premier league", "world cup", "super bowl",
    "drivers champion", "game handicap", "o/u ", "over/under", "eurovision"];
  if (SPORTS_KW.some(kw => allText.includes(kw))) return null;

  // Hard reject: alien/UFO markets
  if (allText.includes("alien") || allText.includes("ufo") || allText.includes("non-human")) return null;

  // Hard reject: tweet-counting markets
  if (allText.includes("tweets from") || allText.includes("post 2") ||
    allText.includes("post 3") || allText.includes("post 4")) return null;

  // Hard reject: same topic on both sides
  const SAME_TOPIC_PAIRS: [string, string][] = [
    ["iran", "iran"], ["bitcoin", "bitcoin"], ["btc", "btc"],
    ["crude oil", "crude oil"], ["oil price", "oil price"], ["crude", "crude"],
    ["federal reserve", "federal reserve"], ["fed rate", "fed rate"], ["fed ", "fed "],
    ["interest rate", "interest rate"], ["israel", "israel"],
    ["ukraine", "ukraine"], ["taiwan", "taiwan"],
    ["election 2026", "election 2026"], ["trump tariff", "trump tariff"],
    ["ethereum", "ethereum"], ["trump", "trump"],
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
    .slice(0, 25);
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
