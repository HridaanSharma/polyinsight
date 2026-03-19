import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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

export function useSpreadScanner(markets: GammaMarket[]): SpreadData[] {
  return useMemo(() => {
    return markets
      .filter(m =>
        m.active === true &&
        m.closed === false &&
        parseFloat(m.volume24hr as any) > 2000 &&
        parseFloat(m.bestAsk as any) < 0.90 &&
        parseFloat(m.bestBid as any) > 0.10
      )
      .map(m => {
        const bestBid = parseFloat(m.bestBid as any) || 0;
        const bestAsk = parseFloat(m.bestAsk as any) || 0;
        const spread = Math.max(0, bestAsk - bestBid);
        return { market: m, bestBid, bestAsk, spread };
      })
      .sort((a, b) => b.spread - a.spread);
  }, [markets]);
}
