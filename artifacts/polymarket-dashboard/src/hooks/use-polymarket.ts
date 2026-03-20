import { useQuery } from "@tanstack/react-query";

export interface GammaTag {
  id: string;
  label: string;
  slug: string;
}

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
  tags?: GammaTag[];
}

export interface SpreadData {
  market: GammaMarket;
  bestBid: number;
  bestAsk: number;
  spread: number;
}

export interface CorrelatedMarket {
  market: GammaMarket;
  eventSlug: string;
  eventTitle: string;
}

export interface CorrelationGroup {
  tag: string;
  markets: CorrelatedMarket[];
  hasMispricing: boolean;
  totalVol: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const USELESS_TAGS = new Set([
  // Too broad to be meaningful
  "Politics", "World", "Recurring", "Trending", "New",
  // Crypto — pure price speculation, not intelligence
  "Bitcoin", "Ethereum", "Crypto", "Cryptocurrency", "DeFi", "NFT",
  "Crypto Prices", "Altcoins",
  // Noise personalities
  "Elon Musk", "Elon Musk Tweets",
  // Entertainment / pure winner markets
  "Eurovision", "Eurovision Song Contest",
  "F1", "Formula 1", "Formula One",
  // Sports leagues and categories
  "NBA", "NFL", "NHL", "MLB", "MLS", "NCAA", "NCAA Basketball", "March Madness",
  "Premier League", "Champions League", "La Liga", "Serie A", "Bundesliga",
  "La Liga", "Ligue 1", "Serie A",
  "Sports", "Basketball", "Football", "American Football", "Baseball", "Soccer",
  "Hockey", "Tennis", "Golf", "MMA", "UFC", "Games", "Rugby", "Cricket", "Volleyball",
  "League of Legends", "Esports",
  // Platform noise
  "Earn 4%", "Polymarket", "Featured",
]);

export function useCorrelationGroups() {
  return useQuery({
    queryKey: ["correlation-groups"],
    queryFn: async (): Promise<CorrelationGroup[]> => {
      const [p1, p2, p3] = await Promise.all([
        fetch(`${BASE}/api/polymarket/events?limit=100&offset=0&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/events?limit=100&offset=100&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/events?limit=100&offset=200&active=true&closed=false&order=volume24hr&ascending=false`),
      ]);
      if (!p1.ok) throw new Error("Failed to fetch events");
      const [e1, e2, e3] = await Promise.all([
        p1.json(),
        p2.ok ? p2.json() : Promise.resolve([]),
        p3.ok ? p3.json() : Promise.resolve([]),
      ]);
      const events: GammaEvent[] = [...e1, ...e2, ...e3].filter(
        (e) => e.active !== false && e.closed !== true
      );

      const tagMap: Record<string, CorrelatedMarket[]> = {};

      events.forEach((event) => {
        const eventTags = (event.tags || []).map((t) => t.label);
        const qualifiedMarkets = (event.markets || []).filter((m) => {
          if (m.active === false || m.closed === true) return false;
          const q = (m.question || "").toLowerCase();
          // Skip tweet counting markets
          if (q.includes("tweet")) return false;
          // Skip crypto price prediction markets (price target + coin name)
          if ((q.includes("bitcoin") || q.includes("ethereum") || q.includes(" btc") || q.includes(" eth")) &&
              (q.includes("reach") || q.includes("hit") || q.includes("above") || q.includes("below") || q.includes("dip"))) return false;
          try {
            const prices = JSON.parse(m.outcomePrices || '["0.5","0.5"]');
            const yes = parseFloat(prices[0]);
            return yes > 0.10 && yes < 0.90 && parseFloat(m.volume24hr as any) > 50000;
          } catch { return false; }
        });

        if (qualifiedMarkets.length === 0) return;

        eventTags.forEach((tag) => {
          if (!tag || USELESS_TAGS.has(tag)) return;
          if (!tagMap[tag]) tagMap[tag] = [];
          qualifiedMarkets.forEach((m) => {
            tagMap[tag].push({ market: m, eventSlug: event.slug, eventTitle: event.title });
          });
        });
      });

      const groups = Object.entries(tagMap)
        .map(([tag, correlated]) => {
          const uniqueEventSlugs = new Set(correlated.map((c) => c.eventSlug));
          if (uniqueEventSlugs.size < 2) return null;
          if (correlated.length < 2) return null;

          const deduped = correlated.filter((c, i, arr) =>
            arr.findIndex((x) => x.market.id === c.market.id) === i
          );

          const hasMispricing = deduped.some((a) => {
            const aChange = Math.abs(parseFloat((a.market.oneDayPriceChange as any) || 0));
            return aChange >= 0.05 && deduped.some((b) => {
              if (b.eventSlug === a.eventSlug) return false;
              const bChange = Math.abs(parseFloat((b.market.oneDayPriceChange as any) || 0));
              return bChange < 0.01;
            });
          });

          const totalVol = deduped.reduce(
            (s, c) => s + parseFloat(c.market.volume24hr as any), 0
          );

          return { tag, markets: deduped, hasMispricing, totalVol };
        })
        .filter((g): g is CorrelationGroup => g !== null)
        .sort((a, b) => b.totalVol - a.totalVol)
        .slice(0, 25);

      return groups;
    },
    refetchInterval: 60000,
  });
}

export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const res = await fetch(
        `${BASE}/api/polymarket/markets?limit=200&offset=0&active=true&closed=false&order=volume24hr&ascending=false`
      );
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      const markets: GammaMarket[] = Array.isArray(data) ? data : [];
      return markets.filter(m => m.active === true && m.closed === false);
    },
    refetchInterval: 30000,
  });
}

export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      const [p1, p2, p3] = await Promise.all([
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=0&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=100&active=true&closed=false&order=volume24hr&ascending=false`),
        fetch(`${BASE}/api/polymarket/markets?limit=100&offset=200&active=true&closed=false&order=volume24hr&ascending=false`),
      ]);
      if (!p1.ok) throw new Error("Failed to fetch markets");
      const [r1, r2, r3] = await Promise.all([
        p1.json(),
        p2.ok ? p2.json() : Promise.resolve([]),
        p3.ok ? p3.json() : Promise.resolve([]),
      ]);
      const allMarkets: GammaMarket[] = [...r1, ...r2, ...r3];
      const now = Date.now();

      return allMarkets
        .filter((m) => {
          if (!m.active || m.closed) return false;
          const bid = parseFloat(m.bestBid as any);
          const ask = parseFloat(m.bestAsk as any);
          const vol = parseFloat(m.volume24hr as any);
          const spread = ask - bid;
          const endsAt = m.endDate ? new Date(m.endDate).getTime() : Infinity;
          return (
            bid > 0 && ask > 0 &&
            bid > 0.05 && ask < 0.95 &&
            spread > 0.01 &&
            vol > 1000 &&
            endsAt > now
          );
        })
        .map((m) => ({
          market: m,
          bestBid: parseFloat(m.bestBid as any),
          bestAsk: parseFloat(m.bestAsk as any),
          spread: parseFloat(m.bestAsk as any) - parseFloat(m.bestBid as any),
        }))
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 30);
    },
    refetchInterval: 60000,
  });
}
