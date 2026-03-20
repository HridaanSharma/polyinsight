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
}

export interface SpreadData {
  market: GammaMarket;
  bestBid: number;
  bestAsk: number;
  spread: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useActiveEvents() {
  return useQuery({
    queryKey: ["gamma-events"],
    queryFn: async (): Promise<GammaEvent[]> => {
      const res = await fetch(
        `${BASE}/api/polymarket/events?limit=50&active=true&closed=false&order=volume24hr&ascending=false`
      );
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      const events: GammaEvent[] = Array.isArray(data) ? data : [];
      return events.filter(e => e.active !== false && e.closed !== true);
    },
    refetchInterval: 30000,
  });
}

export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const res = await fetch(
        `${BASE}/api/polymarket/markets?limit=100&active=true&closed=false&order=volume24hr&ascending=false`
      );
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      const markets: GammaMarket[] = Array.isArray(data) ? data : [];
      return markets.filter(m => m.active === true && m.closed === false);
    },
    refetchInterval: 30000,
  });
}

function parseClobTokenId(raw: string | string[]): string | null {
  try {
    if (Array.isArray(raw)) return raw[0] ?? null;
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  } catch {
    return null;
  }
}

export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      const res = await fetch(
        `${BASE}/api/polymarket/markets?limit=30&active=true&closed=false&order=volume24hr&ascending=false`
      );
      if (!res.ok) throw new Error("Failed to fetch markets");
      const markets: GammaMarket[] = await res.json();

      const filtered = markets.filter(
        m =>
          m.active === true &&
          m.closed === false &&
          parseFloat(m.volume24hr as any) > 5000
      );

      const results = await Promise.all(
        filtered.map(async m => {
          try {
            const tokenId = parseClobTokenId(m.clobTokenIds);
            if (!tokenId) return null;
            const bookRes = await fetch(
              `${BASE}/api/polymarket/book?token_id=${tokenId}`
            );
            if (!bookRes.ok) return null;
            const book = await bookRes.json();
            return { market: m, book };
          } catch {
            return null;
          }
        })
      );

      return results
        .filter((r): r is { market: GammaMarket; book: any } => r !== null)
        .map(({ market, book }) => {
          const bestBid = parseFloat(book.bids?.[0]?.price ?? "0");
          const bestAsk = parseFloat(book.asks?.[0]?.price ?? "1");
          const spread = Math.max(0, bestAsk - bestBid);
          return { market, bestBid, bestAsk, spread };
        })
        .filter(d => d.bestBid >= 0.05 && d.bestBid <= 0.95 && d.spread > 0.02)
        .sort((a, b) => b.spread - a.spread);
    },
    refetchInterval: 60000,
  });
}
