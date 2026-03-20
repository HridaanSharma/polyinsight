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

// ── Cross-category causal chain definitions ───────────────────────────────────
// Each chain requires markets from BOTH group A and group B — that's the value:
// they're from different parts of Polymarket but move together in real life.
const CROSS_CHAINS = [
  {
    theme: "If US Invades Iran → Oil Spikes",
    description: "Traders betting on Iran conflict should also watch oil price markets",
    emoji: "⚡",
    groupALabel: "IRAN / CONFLICT",
    groupBLabel: "OIL PRICES",
    keywordsA: ["us forces enter iran", "invade iran", "us attack iran", "iran x israel", "iran x us", "kharg", "hormuz"],
    keywordsB: ["crude oil", "oil price", "oil hit", "brent"],
  },
  {
    theme: "Iranian Regime Falls → Regional Domino",
    description: "Regime change cascades into oil stability, Israel, and Netanyahu odds",
    emoji: "🏛️",
    groupALabel: "REGIME CHANGE",
    groupBLabel: "REGIONAL IMPACT",
    keywordsA: ["iranian regime", "iran leadership change", "iran regime fall"],
    keywordsB: ["netanyahu", "crude oil", "oil price", "oil hit", "israel launch", "israel ground"],
  },
  {
    theme: "Fed Decision → S&P 500 Move",
    description: "Rate decisions directly affect whether the S&P opens up or down",
    emoji: "🏦",
    groupALabel: "FED / RATES",
    groupBLabel: "S&P 500",
    keywordsA: ["fed interest rate", "fed rate", "rate cut", "rate hike", "bps after the"],
    keywordsB: ["s&p 500", "s&p 500 (spx)"],
  },
  {
    theme: "Ukraine Ceasefire → Iran Spotlight",
    description: "If Ukraine settles, US military focus shifts fully to Iran",
    emoji: "🕊️",
    groupALabel: "UKRAINE / RUSSIA",
    groupBLabel: "IRAN / US FORCES",
    keywordsA: ["russia x ukraine ceasefire", "ukraine ceasefire", "russia x ukraine"],
    keywordsB: ["us forces enter iran", "invade iran", "us attack iran", "iran x us"],
  },
  {
    theme: "US Distracted by Iran → Taiwan Risk",
    description: "If the US is fighting in Iran, China may read Taiwan as an opportunity",
    emoji: "🌏",
    groupALabel: "IRAN CONFLICT",
    groupBLabel: "TAIWAN / CHINA",
    keywordsA: ["us forces enter iran", "invade iran", "us attack iran", "kharg", "hormuz"],
    keywordsB: ["china invade taiwan", "invade taiwan"],
  },
  {
    theme: "OpenAI vs NVIDIA — Who Wins the AI Race?",
    description: "Model leadership and hardware dominance are two sides of the same bet",
    emoji: "🤖",
    groupALabel: "AI MODELS",
    groupBLabel: "AI HARDWARE",
    keywordsA: ["openai", "anthropic", "best ai model", "gpt"],
    keywordsB: ["nvidia", "largest company", "nvidia market cap"],
  },
] as const;

// ── Filter & enrich a single market ──────────────────────────────────────────
function enrichMarket(m: GammaMarket): ChainMarket | null {
  try {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    if (yes < 0.05 || yes > 0.95) return null;
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

// ── Cross-category causal chains ─────────────────────────────────────────────
export function useCausalChains() {
  const { data: allMarkets = [], ...rest } = useAllMarkets();

  const chains: CrossChain[] = CROSS_CHAINS.map(def => {
    const matchGroup = (keywords: readonly string[]) => {
      const results: ChainMarket[] = [];
      const seen = new Set<string>();
      for (const m of allMarkets) {
        const key = m.conditionId || m.id;
        if (seen.has(key)) continue;
        const q = (m.question || "").toLowerCase();
        if (!keywords.some(kw => q.includes(kw))) continue;
        const enriched = enrichMarket(m);
        if (!enriched) continue;
        seen.add(key);
        results.push(enriched);
        if (results.length >= 5) break;
      }
      return results;
    };

    const groupA = matchGroup(def.keywordsA);
    const groupB = matchGroup(def.keywordsB);

    // Both sides must have at least 1 market — that's the cross-category value
    if (groupA.length === 0 || groupB.length === 0) return null;

    const allMkts = [...groupA, ...groupB];
    const totalVolume = allMkts.reduce((s, m) => s + parseFloat((m.volume24hr || 0) as any), 0);

    return {
      theme: def.theme,
      description: def.description,
      emoji: def.emoji,
      groupALabel: def.groupALabel,
      groupBLabel: def.groupBLabel,
      groupA,
      groupB,
      totalVolume,
    };
  }).filter((c): c is CrossChain => c !== null);

  return { chains, ...rest };
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
