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
// Each chain requires markets from BOTH sides — the value is they're from
// different parts of Polymarket but move together in real life.
// Chains with no live markets on either side are automatically hidden.
const CROSS_CHAINS = [
  {
    theme: "US Invades Iran → Oil Spikes",
    emoji: "⚡",
    description: "If US enters Iran, oil through Hormuz gets disrupted. Betting one without the other is incomplete.",
    groupALabel: "IRAN CONFLICT",
    groupBLabel: "OIL PRICES",
    keywordsA: ["iran", "invade iran", "us forces enter", "hormuz", "kharg"],
    keywordsB: ["crude oil", "brent oil", "oil price", "wti"],
  },
  {
    theme: "Fed Holds Rates → Recession Risk",
    emoji: "🏦",
    description: "If Fed keeps rates high, recession and unemployment odds should rise. Check if they have.",
    groupALabel: "FED DECISIONS",
    groupBLabel: "ECONOMIC IMPACT",
    keywordsA: ["federal reserve", "fed rate", "interest rate", "bps after", "fomc"],
    keywordsB: ["recession", "unemployment", "gdp", "s&p 500", "stock market crash"],
  },
  {
    theme: "Trump Tariffs → China GDP Falls",
    emoji: "🌏",
    description: "Trump tariffs on China directly pressure Chinese economic growth. These markets should move together.",
    groupALabel: "TRUMP TRADE POLICY",
    groupBLabel: "CHINA ECONOMY",
    keywordsA: ["tariff", "trade war", "trump china", "trump trade"],
    keywordsB: ["china gdp", "china economy", "chinese economy", "yuan"],
  },
  {
    theme: "Democrats Win Senate → Policy Passes",
    emoji: "🏛️",
    description: "Senate control is the bottleneck for every major bill. If Dem odds move, policy markets should follow.",
    groupALabel: "SENATE CONTROL",
    groupBLabel: "POLICY OUTCOMES",
    keywordsA: ["democrats win senate", "republican senate", "senate majority", "midterm senate"],
    keywordsB: ["climate bill", "immigration bill", "minimum wage", "student loan", "healthcare bill"],
  },
  {
    theme: "Iranian Regime Falls → Israel & Oil Reshuffled",
    emoji: "🕊️",
    description: "Regime collapse changes the entire Middle East balance — Netanyahu, oil, and regional conflict all reprice.",
    groupALabel: "REGIME CHANGE",
    groupBLabel: "REGIONAL IMPACT",
    keywordsA: ["iranian regime fall", "iran leadership change", "iran government"],
    keywordsB: ["netanyahu", "israel", "crude oil", "saudi", "lebanon"],
  },
  {
    theme: "Bitcoin Crashes → Crypto Regulation Hardens",
    emoji: "₿",
    description: "A BTC crash historically triggers regulatory crackdown. Check if regulation markets have priced this in.",
    groupALabel: "BTC PRICE",
    groupBLabel: "CRYPTO REGULATION",
    keywordsA: ["bitcoin dip", "bitcoin below", "bitcoin crash", "bitcoin drop"],
    keywordsB: ["crypto regulation", "bitcoin etf", "sec crypto", "coinbase", "crypto ban"],
  },
  {
    theme: "AI Breakthrough → Nvidia & Tech Stocks Spike",
    emoji: "🤖",
    description: "Major AI model releases historically move Nvidia and tech valuations. Are these markets in sync?",
    groupALabel: "AI MILESTONES",
    groupBLabel: "TECH MARKET",
    keywordsA: ["openai", "anthropic", "gpt-5", "gemini", "ai model release", "best ai model"],
    keywordsB: ["nvidia", "s&p 500", "nasdaq", "tech stock", "microsoft stock", "apple stock"],
  },
  {
    theme: "Russia-Ukraine Ceasefire → Energy Prices Drop",
    emoji: "🇺🇦",
    description: "A ceasefire reopens gas pipelines and removes energy war premium. Oil and gas markets should reprice.",
    groupALabel: "WAR OUTCOME",
    groupBLabel: "ENERGY MARKETS",
    keywordsA: ["ukraine ceasefire", "russia ukraine", "zelensky", "putin ukraine", "ukraine war ends"],
    keywordsB: ["natural gas", "crude oil", "europe energy", "gas price", "oil price"],
  },
  {
    theme: "US Debt Ceiling Crisis → Dollar Weakens",
    emoji: "💵",
    description: "Debt ceiling fights historically weaken the dollar and spike gold. Check if currency markets reflect this.",
    groupALabel: "DEBT CEILING",
    groupBLabel: "CURRENCY / GOLD",
    keywordsA: ["debt ceiling", "us default", "government shutdown", "us debt"],
    keywordsB: ["dollar index", "gold price", "dxy", "gold above"],
  },
  {
    theme: "China Invades Taiwan → Semiconductor Crisis",
    emoji: "🔧",
    description: "Taiwan produces 90% of advanced chips. Invasion odds should be reflected in semiconductor markets.",
    groupALabel: "TAIWAN CONFLICT",
    groupBLabel: "TECH / CHIPS",
    keywordsA: ["china invade taiwan", "taiwan invasion", "taiwan strait", "china taiwan"],
    keywordsB: ["semiconductor", "nvidia", "tsmc", "chip shortage", "tech supply"],
  },
] as const;

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

// ── Cross-category causal chains ─────────────────────────────────────────────
export function useCausalChains() {
  const { data: allMarkets = [], ...rest } = useAllMarkets();

  const chains: CrossChain[] = CROSS_CHAINS.map(def => {
    const matchGroup = (keywords: readonly string[], limit = 6) => {
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
        if (results.length >= limit) break;
      }
      return results;
    };

    const groupA = matchGroup(def.keywordsA);
    const groupB = matchGroup(def.keywordsB);

    // Both sides must have at least 1 market — that's the whole cross-category value
    if (groupA.length === 0 || groupB.length === 0) return null;
    // Need at least 3 markets total across both sides
    if (groupA.length + groupB.length < 3) return null;

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
  })
    .filter((c): c is CrossChain => c !== null)
    .sort((a, b) => b.totalVolume - a.totalVolume); // highest volume chains first

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
