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
      // Fetch two pages to get a wide pool of 200 markets
      const [page1, page2] = await Promise.all([
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=0&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=100&active=true&closed=false&order=volume24hr&ascending=false`),
      ]);
      if (!page1.ok) throw new Error("Failed to fetch markets");
      const [raw1, raw2] = await Promise.all([
        page1.json(),
        page2.ok ? page2.json() : Promise.resolve([]),
      ]);
      const allMarkets: GammaMarket[] = [...(raw1 as GammaMarket[]), ...(raw2 as GammaMarket[])];

      // Use Gamma's AMM bid/ask — this is the actual tradeable price (CLOB books
      // are thin for most Polymarket markets since volume flows through their AMM).
      const now = Date.now();
      return allMarkets
        .filter(m => {
          if (!m.active || m.closed) return false;
          const bid = parseFloat(m.bestBid as any);
          const ask = parseFloat(m.bestAsk as any);
          const vol = parseFloat(m.volume24hr as any);
          const spread = ask - bid;
          const endsAt = m.endDate ? new Date(m.endDate).getTime() : Infinity;
          return (
            vol > 2000 &&
            bid > 0.05 && ask < 0.95 &&
            spread > 0.02 &&
            endsAt > now
          );
        })
        .map(m => ({
          market: m,
          bestBid: parseFloat(m.bestBid as any),
          bestAsk: parseFloat(m.bestAsk as any),
          spread: parseFloat(m.bestAsk as any) - parseFloat(m.bestBid as any),
        }))
        .sort((a, b) => b.spread - a.spread);
    },
    refetchInterval: 60000,
  });
}
