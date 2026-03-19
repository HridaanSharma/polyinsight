import { useQuery } from "@tanstack/react-query";

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  volume: number;
  volume24hr: number;
  volumeClob: number;
  createdAt: string;
  active: boolean;
  closed: boolean;
  clobTokenIds: string;
  outcomePrices: string;
  lastTradePrice: number;
  priceChange: number;
  eventSlug: string;
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

export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const res = await fetch(`${BASE}/api/polymarket/markets?limit=100&active=true`);
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30000,
  });
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
          const tokens = JSON.parse(market.clobTokenIds || "[]");
          const tokenId = tokens[0];
          if (!tokenId) return null;

          const res = await fetch(`${BASE}/api/polymarket/book?token_id=${encodeURIComponent(tokenId)}`);
          if (!res.ok) return null;

          const data: ClobOrderbook = await res.json();
          const bids = data.bids || [];
          const asks = data.asks || [];

          const bestBid = bids.length > 0
            ? Math.max(...bids.map(b => parseFloat(b.price)))
            : 0;

          const bestAsk = asks.length > 0
            ? Math.min(...asks.map(a => parseFloat(a.price)))
            : 1;

          const spread = Math.max(0, bestAsk - bestBid);

          return {
            market,
            bestBid,
            bestAsk,
            spread
          } as SpreadData;
        } catch (error) {
          console.error(`Error fetching orderbook for ${market.id}:`, error);
          return null;
        }
      });

      const results = await Promise.all(promises);
      return results.filter((res): res is SpreadData => res !== null)
        .sort((a, b) => b.spread - a.spread);
    },
    enabled: markets.length > 0,
    refetchInterval: 10000,
  });
}
