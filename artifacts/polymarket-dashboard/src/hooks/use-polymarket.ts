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
  priceChange: number;
  eventSlug: string;
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

export interface OrderbookEntry {
  price: string;
  size: string;
}

export interface ClobOrderbook {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
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
      const res = await fetch(`${BASE}/api/polymarket/events?limit=50&active=true&closed=false`);
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
      const res = await fetch(`${BASE}/api/polymarket/markets?limit=100&active=true&closed=false`);
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      const markets: GammaMarket[] = Array.isArray(data) ? data : [];
      return markets.filter(m => m.active !== false && m.closed !== true);
    },
    refetchInterval: 30000,
  });
}

function getTokenId(market: GammaMarket): string | null {
  try {
    if (Array.isArray(market.clobTokenIds)) return market.clobTokenIds[0] ?? null;
    const parsed = JSON.parse(market.clobTokenIds as string || "[]");
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}

export function useSpreadScanner(markets: GammaMarket[]) {
  return useQuery({
    queryKey: ["spread-scanner", markets.map(m => m.id).join(",").substring(0, 100)],
    queryFn: async (): Promise<SpreadData[]> => {
      const top50 = [...markets]
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 50);

      const promises = top50.map(async (market) => {
        try {
          const tokenId = getTokenId(market);
          if (!tokenId) return null;

          const res = await fetch(`${BASE}/api/polymarket/book?token_id=${encodeURIComponent(tokenId)}`);
          if (!res.ok) return null;

          const data: ClobOrderbook = await res.json();
          const bids = data.bids || [];
          const asks = data.asks || [];

          if (bids.length === 0 || asks.length === 0) return null;

          const bestBid = parseFloat(bids[0].price);
          const bestAsk = parseFloat(asks[0].price);

          if (isNaN(bestBid) || isNaN(bestAsk)) return null;

          const spread = Math.max(0, bestAsk - bestBid);

          return { market, bestBid, bestAsk, spread } as SpreadData;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(promises);
      return results
        .filter((r): r is SpreadData => r !== null)
        .sort((a, b) => b.spread - a.spread);
    },
    enabled: markets.length > 0,
    refetchInterval: 15000,
  });
}
