import { useQuery } from "@tanstack/react-query";

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
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
  oneDayPriceChange: number;
  priceChange: number;
  eventSlug: string;
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

export interface CorrelationMarket {
  question: string;
  slug: string;
  probability: number;
  volume24hr: number;
  eventSlug: string;
}

export interface CorrelationPair {
  market1: CorrelationMarket;
  market2: CorrelationMarket;
  relationship: string;
  inconsistency: string;
  direction: "market1_underpriced" | "market2_underpriced" | "market1_overpriced" | "market2_overpriced" | "unknown";
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

export function useCorrelationPairs() {
  return useQuery({
    queryKey: ["correlation-pairs"],
    queryFn: async (): Promise<CorrelationPair[]> => {
      const res = await fetch(`${BASE}/api/polymarket/correlations`);
      if (!res.ok) throw new Error("Failed to fetch correlations");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 10 * 60 * 1000,
    staleTime: 9 * 60 * 1000,
  });
}

export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const [p1, p2] = await Promise.all([
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=0&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=100&active=true&closed=false&order=volume24hr&ascending=false`),
      ]);
      if (!p1.ok) throw new Error("Failed to fetch markets");
      const [m1, m2] = await Promise.all([
        p1.json(),
        p2.ok ? p2.json() : Promise.resolve([]),
      ]);
      const markets: GammaMarket[] = [...m1, ...m2];
      return markets.filter(m => m.active === true && m.closed === false);
    },
    refetchInterval: 30000,
  });
}

export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      // Fetch markets ranked 30-230 by volume — skip top 30 (too liquid, tiny spreads)
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

      // Pre-filter by Gamma data to avoid wasting CLOB calls on dead markets
      const candidates = allMarkets.filter(m => {
        if (!m.active || m.closed) return false;
        const bid = parseFloat(m.bestBid as any);
        const ask = parseFloat(m.bestAsk as any);
        const vol = parseFloat(m.volume24hr as any);
        const endsAt = m.endDate ? new Date(m.endDate).getTime() : Infinity;
        return bid > 0.03 && ask < 0.97 && vol > 2000 && endsAt > now;
      });

      // Hit CLOB for each candidate in parallel
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

      // Fallback: if CLOB returns nothing, use Gamma cached bid/ask
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
