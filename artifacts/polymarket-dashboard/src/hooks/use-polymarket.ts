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

export interface CausalChain {
  theme: string;
  description: string;
  emoji: string;
  markets: ChainMarket[];
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

function getTradeUrl(m: GammaMarket): string {
  if (m.url) return m.url;
  if (m.slug) return `https://polymarket.com/event/${m.slug}`;
  return "https://polymarket.com";
}

// ── Causal chain definitions ────────────────────────────────────────────────
const CAUSAL_CHAINS = [
  {
    theme: "Iran Military Escalation",
    description: "US entry, oil prices, regime stability, and ceasefire are all connected",
    emoji: "⚡",
    keywords: ["iran", "crude oil", "hormuz", "kharg island"],
  },
  {
    theme: "Israel & Middle East",
    description: "Netanyahu, Gaza, Lebanon, and regional ceasefire outcomes move together",
    emoji: "🕊️",
    keywords: ["israel", "netanyahu", "gaza", "lebanon offensive", "iran x israel", "israel/us conflict"],
  },
  {
    theme: "Trump Policy",
    description: "Trump's decisions on wars, trade, and diplomacy are interconnected",
    emoji: "🇺🇸",
    keywords: ["trump", "tariff", "china trade", "trade war", "taiwan strait"],
  },
  {
    theme: "2026 US Elections",
    description: "Senate and governor races determine the balance of power in 2027",
    emoji: "🗳️",
    keywords: ["senate election", "governor election", "senate seat", "governor race", "win the senate", "win the governorship", "2026 senate", "2026 governor"],
  },
  {
    theme: "AI & Tech Race",
    description: "AI model releases, regulation, and company milestones are linked",
    emoji: "🤖",
    keywords: ["openai", "anthropic", "google deepmind", " agi ", "gpt-5", "nvidia earnings", "llm ", "ai model"],
  },
  {
    theme: "Russia-Ukraine War",
    description: "Ceasefire, territory, and NATO outcomes are deeply linked",
    emoji: "🛡️",
    keywords: ["ukraine", "zelensky", "russia invade", "crimea", "donbas", "nato ukraine", "ukraine ceasefire"],
  },
  {
    theme: "Crypto Market",
    description: "Bitcoin, Ethereum, and crypto regulation move together",
    emoji: "₿",
    keywords: ["bitcoin", "ethereum", "btc above", "eth above", "crypto regulation", "bitcoin etf"],
  },
] as const;

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

// ── Causal chains built from the 500-market dataset ─────────────────────────
export function useCausalChains() {
  const { data: allMarkets = [], ...rest } = useAllMarkets();

  const chains: CausalChain[] = CAUSAL_CHAINS.map(def => {
    const matched = allMarkets.filter(m => {
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        if (yes < 0.05 || yes > 0.95) return false;
        if (parseFloat(m.volume24hr as any) < 10000) return false;
      } catch { return false; }

      const q = (m.question || "").toLowerCase();
      const title = (m.groupItemTitle || "").toLowerCase();
      return def.keywords.some(kw => q.includes(kw) || title.includes(kw));
    }).filter(m => {
      // Extra quality gate: only genuinely uncertain markets (8–92%)
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        return yes >= 0.08 && yes <= 0.92;
      } catch { return false; }
    });

    // Deduplicate by conditionId, then enrich
    const seen = new Set<string>();
    const unique: ChainMarket[] = [];
    for (const m of matched) {
      const key = m.conditionId || m.id;
      if (seen.has(key)) continue;
      seen.add(key);
      let probability = 0.5;
      try { probability = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]); } catch {}
      const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any);
      unique.push({
        ...m,
        probability,
        moved: Math.abs(change) > 0.03,
        moveDirection: change > 0.03 ? "up" : change < -0.03 ? "down" : "flat",
        tradeUrl: getTradeUrl(m),
      });
      if (unique.length >= 8) break;
    }

    if (unique.length < 2) return null;

    return {
      theme: def.theme,
      description: def.description,
      emoji: def.emoji,
      markets: unique,
      totalVolume: unique.reduce((s, m) => s + parseFloat((m.volume24hr || 0) as any), 0),
    };
  }).filter((c): c is CausalChain => c !== null);

  return { chains, ...rest };
}

// ── Smaller market set for the Volume Spikes + Spread Scanner ───────────────
export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const [p1, p2, p3, p4, p5] = await Promise.all([
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=0&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=100&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=200&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=300&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=400&active=true&closed=false&order=volume24hr&ascending=false`),
      ]);
      const pages = await Promise.all([p1, p2, p3, p4, p5].map(r => (r.ok ? r.json() : [])));
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
