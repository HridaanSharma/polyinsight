import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  source?: "keyword" | "ai";
}

// Intermediate type between Call 1 and Call 2
interface RawChain {
  theme: string;
  emoji?: string;
  description?: string;
  sideA_label?: string;
  sideB_label?: string;
  sideAMarkets: GammaMarket[];
  sideBMarkets: GammaMarket[];
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
  const eventSlug = m.events?.[0]?.slug;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  return `https://polymarket.com/event/${m.slug}`;
}

function enrichMarket(m: GammaMarket): ChainMarket | null {
  try {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    if (yes <= 0.04 || yes >= 0.96) return null;
    if (parseFloat(m.volume24hr as any) < 3000) return null;
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

// ── Categorize a market by its question text ──────────────────────────────────
function categorizeMarket(m: GammaMarket): string {
  const q = m.question.toLowerCase();
  if (q.includes("iran") || q.includes("israel") || q.includes("ukraine") ||
      q.includes("russia") || q.includes("taiwan") || q.includes(" war") ||
      q.includes("invade") || q.includes("military") || q.includes("ceasefire") ||
      q.includes("kharg") || q.includes("hormuz"))
    return "conflict";
  if (q.includes("crude oil") || q.includes("oil price") || q.includes("brent") ||
      q.includes("natural gas") || q.includes("energy price"))
    return "energy";
  if (q.includes("bitcoin") || q.includes("ethereum") || q.includes("crypto") ||
      q.includes("xrp") || q.includes("solana") || q.includes(" btc"))
    return "crypto";
  if (q.includes("fed ") || q.includes("federal reserve") || q.includes("interest rate") ||
      q.includes(" bps") || q.includes("fomc") || q.includes("inflation rate"))
    return "monetary";
  if (q.includes("trump") || q.includes("democrat") || q.includes("republican") ||
      q.includes("senate") || q.includes("house seat") || q.includes("us election") ||
      q.includes("midterm") || q.includes("us president"))
    return "uspolitics";
  if (q.includes("china") || q.includes("xi jinping") || q.includes("beijing") ||
      q.includes("tariff") || q.includes("trade war"))
    return "china";
  if (q.includes("s&p") || q.includes("nasdaq") || q.includes("stock market") ||
      q.includes("dow jones") || q.includes("market cap") || q.includes("equity"))
    return "equities";
  if (q.includes("gdp") || q.includes("recession") || q.includes("unemployment") ||
      q.includes("us economy") || q.includes("economic growth"))
    return "economics";
  if (q.includes("netanyahu") || q.includes("putin") || q.includes("zelensky") ||
      q.includes("modi") || q.includes("macron") || q.includes("merz") ||
      q.includes("prime minister") || q.includes("president of "))
    return "leadership";
  if (q.includes("climate") || q.includes("bill passes") || q.includes("legislation") ||
      q.includes("congress passes") || q.includes("signed into law"))
    return "policy";
  if (q.includes(" gold ") || q.includes("silver price") || q.includes("us dollar") ||
      q.includes(" yen") || q.includes(" euro") || q.includes("currency"))
    return "currency";
  if (q.includes("nuclear") || q.includes("nato") || q.includes(" un ") ||
      q.includes("sanctions") || q.includes("diplomatic") || q.includes("treaty"))
    return "diplomacy";
  return "other";
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

// ── Build diverse market set: top 15 per category ────────────────────────────
function buildDiverseSet(allMarkets: GammaMarket[]): GammaMarket[] {
  const byCategory: Record<string, GammaMarket[]> = {};
  for (const m of allMarkets) {
    const cat = categorizeMarket(m);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(m);
  }
  console.log("Markets by category:", Object.entries(byCategory).map(([k, v]) => `${k}:${v.length}`).join(", "));

  const diverse: GammaMarket[] = [];
  for (const cat of Object.keys(byCategory)) {
    const top15 = byCategory[cat]
      .sort((a, b) => parseFloat(b.volume24hr as any) - parseFloat(a.volume24hr as any))
      .slice(0, 15);
    diverse.push(...top15);
  }

  const seen = new Set<string>();
  const final = diverse.filter(m => {
    if (seen.has(m.conditionId)) return false;
    seen.add(m.conditionId);
    return true;
  });
  console.log("Diverse set size:", final.length, "| Categories:", Object.keys(byCategory).join(", "));
  return final;
}

// ── Build market list string with category labels ─────────────────────────────
function buildMarketList(markets: GammaMarket[]): string {
  return markets.map((m, i) => {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    const vol = parseFloat(m.volume24hr as any) || 0;
    const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any) || 0;
    const dir = change > 0.03 ? "\u25b2" : change < -0.03 ? "\u25bc" : "=";
    const cat = categorizeMarket(m).toUpperCase();
    return `${i}.[${cat}] ${m.question} | ${(yes * 100).toFixed(0)}% | $${(vol / 1000).toFixed(0)}K | ${dir}`;
  }).join("\n");
}

// ── CALL 1 prompt: liberal "find" — no scoring, just discover ─────────────────
function buildFindPrompt(markets: GammaMarket[]): string {
  const marketList = buildMarketList(markets);
  return (
    `You are a macro trader. Here are active Polymarket markets:\n\n` +
    `${marketList}\n\n` +
    `Find 20 groups where markets from DIFFERENT categories are causally connected.\n` +
    `One side is the CAUSE, the other side is the EFFECT.\n` +
    `Each side needs minimum 2 markets.\n` +
    `Different categories means: conflict \u2260 energy \u2260 monetary \u2260 crypto \u2260 uspolitics \u2260 policy \u2260 economics \u2260 leadership \u2260 diplomacy\n\n` +
    `Examples of valid cross-category pairs:\n` +
    `- [CONFLICT] \u2192 [ENERGY]: invasion closes Hormuz, oil spikes\n` +
    `- [MONETARY] \u2192 [CRYPTO]: Fed holds rates, Bitcoin drops\n` +
    `- [USPOLITICS] \u2192 [POLICY]: Democrats win Senate, climate bill passes\n` +
    `- [CHINA] \u2192 [ECONOMICS]: tariffs on China, US recession risk rises\n` +
    `- [LEADERSHIP] \u2192 [DIPLOMACY]: Netanyahu removed, ceasefire possible\n` +
    `- [MONETARY] \u2192 [EQUITIES]: Fed cuts, S&P rallies\n` +
    `- [CONFLICT] \u2192 [CURRENCY]: war escalates, dollar strengthens\n` +
    `- [ECONOMICS] \u2192 [MONETARY]: recession hits, Fed forced to cut\n\n` +
    `Only use indices that exist in the list above (0\u2013${markets.length - 1}).\n\n` +
    `Return ONLY JSON:\n` +
    `[\n` +
    `  {\n` +
    `    "theme": "Cause \u2192 Effect",\n` +
    `    "emoji": "emoji",\n` +
    `    "description": "one sentence",\n` +
    `    "sideA_label": "CAUSE",\n` +
    `    "sideA_indices": [3, 7],\n` +
    `    "sideB_label": "EFFECT",\n` +
    `    "sideB_indices": [12, 15]\n` +
    `  }\n` +
    `]`
  );
}

// ── CALL 2 prompt: strict validator — sees real question text ──────────────────
function buildValidatePrompt(chainDescriptions: string, count: number): string {
  return (
    `You are validating causal relationships between prediction markets.\n\n` +
    `For each group below, answer: is the causal link DIRECT (one step) or INDIRECT (multiple steps)?\n\n` +
    `DIRECT examples (keep these):\n` +
    `- Iran invades \u2192 oil spikes: DIRECT because Hormuz closure immediately removes supply\n` +
    `- Fed holds rates \u2192 Bitcoin drops: DIRECT because risk-free rate immediately competes with crypto\n` +
    `- Democrats win Senate \u2192 bill passes: DIRECT because votes directly determine legislation\n` +
    `- Ukraine ceasefire \u2192 gas prices drop: DIRECT because pipelines immediately reopen\n\n` +
    `INDIRECT examples (reject these):\n` +
    `- Iran conflict \u2192 Bitcoin: INDIRECT (war \u2192 sentiment \u2192 risk off \u2192 crypto, too many steps)\n` +
    `- Oil spike \u2192 tech stocks: INDIRECT (oil \u2192 inflation \u2192 Fed \u2192 rates \u2192 multiples \u2192 stocks)\n` +
    `- Regime falls \u2192 2028 election: INDIRECT (regime \u2192 foreign policy win \u2192 popularity \u2192 election 2 years later)\n` +
    `- War \u2192 market cap of Apple: INDIRECT (no direct mechanism)\n\n` +
    `Here are the ${count} groups to validate:\n` +
    `${chainDescriptions}\n\n` +
    `Return ONLY a JSON array of index numbers to KEEP (direct chains only). Example: [0, 2, 5, 7]\n` +
    `Only include indices of chains with a genuine one-step causal mechanism.`
  );
}

// ── Basic noise filter (sports, UFO, tweets) — applied after Call 1 ───────────
function isNoisy(markets: GammaMarket[]): boolean {
  const text = markets.map(m => m.question.toLowerCase()).join(" ");
  const NOISE = [" vs ", " vs. ", "win on 2026", "win on 2025", "nba", "nfl", "nhl", "mlb",
    "champions league", "premier league", "world cup", "super bowl", "eurovision",
    "drivers champion", "game handicap", "o/u ", "over/under", "alien", "ufo",
    "non-human", "tweets from", "post 2", "post 3"];
  return NOISE.some(kw => text.includes(kw));
}

// ── Parse JSON from Claude response ──────────────────────────────────────────
function parseJson<T>(text: string): T | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// ── Fetch AI chains: two sequential Claude calls ──────────────────────────────
async function fetchAiChains(allMarkets: GammaMarket[]): Promise<CrossChain[]> {
  const meaningful = allMarkets.filter(m => {
    try {
      const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
      const vol24 = parseFloat(m.volume24hr as any) || 0;
      return yes > 0.05 && yes < 0.95 && vol24 > 3000 && m.active && !m.closed;
    } catch { return false; }
  });

  const diverseSet = buildDiverseSet(meaningful);
  if (diverseSet.length < 20) return [];

  // ── CALL 1: Find chains (liberal) ──────────────────────────────────────────
  console.log("Call 1: finding chains across", diverseSet.length, "markets");
  const findRes = await fetch(`${BASE}/api/polymarket/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: buildFindPrompt(diverseSet) }],
    }),
  });
  if (!findRes.ok) { console.error("Call 1 HTTP error:", findRes.status); return []; }
  const findData = await findRes.json();
  if (findData.error) { console.error("Call 1 API error:", findData.error); return []; }

  const rawText = findData?.content?.[0]?.text ?? "[]";
  console.log("Call 1 response start:", rawText.substring(0, 200));
  const rawChains = parseJson<any[]>(rawText);
  if (!rawChains) { console.error("Call 1 JSON parse failed"); return []; }
  console.log("Call 1 found", rawChains.length, "raw chains");

  // Resolve indices → market objects, apply basic noise filter
  const chainObjects: RawChain[] = [];
  for (const chain of rawChains) {
    const sideAMarkets = ((chain.sideA_indices || []) as number[])
      .filter(i => Number.isInteger(i) && i >= 0 && i < diverseSet.length)
      .map(i => diverseSet[i])
      .filter((m): m is GammaMarket => Boolean(m));
    const sideBMarkets = ((chain.sideB_indices || []) as number[])
      .filter(i => Number.isInteger(i) && i >= 0 && i < diverseSet.length)
      .map(i => diverseSet[i])
      .filter((m): m is GammaMarket => Boolean(m));
    if (sideAMarkets.length < 2 || sideBMarkets.length < 2) continue;
    if (isNoisy([...sideAMarkets, ...sideBMarkets])) continue;
    chainObjects.push({
      theme: String(chain.theme || ""),
      emoji: chain.emoji ? String(chain.emoji) : undefined,
      description: chain.description ? String(chain.description) : undefined,
      sideA_label: chain.sideA_label ? String(chain.sideA_label) : undefined,
      sideB_label: chain.sideB_label ? String(chain.sideB_label) : undefined,
      sideAMarkets,
      sideBMarkets,
    });
  }

  if (chainObjects.length === 0) { console.log("No chains survived noise filter"); return []; }
  console.log("After noise filter:", chainObjects.length, "chains");

  // ── CALL 2: Validate chains (strict) ─────────────────────────────────────
  const chainDescriptions = chainObjects.map((c, i) =>
    `${i}. THEME: ${c.theme}\n` +
    `   CAUSE MARKETS: ${c.sideAMarkets.map(m => `"${m.question}"`).join(", ")}\n` +
    `   EFFECT MARKETS: ${c.sideBMarkets.map(m => `"${m.question}"`).join(", ")}`
  ).join("\n\n");

  console.log("Call 2: validating", chainObjects.length, "chains");
  const validateRes = await fetch(`${BASE}/api/polymarket/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: buildValidatePrompt(chainDescriptions, chainObjects.length) }],
    }),
  });
  if (!validateRes.ok) { console.error("Call 2 HTTP error:", validateRes.status); return []; }
  const validateData = await validateRes.json();
  if (validateData.error) { console.error("Call 2 API error:", validateData.error); return []; }

  const keepText = validateData?.content?.[0]?.text ?? "[]";
  console.log("Call 2 keeping indices:", keepText.substring(0, 200));
  const keepIndices = parseJson<number[]>(keepText);
  if (!keepIndices) { console.error("Call 2 JSON parse failed"); return []; }
  console.log("Call 2 approved", keepIndices.length, "chains:", keepIndices);

  // ── Build final CrossChain[] from kept indices ─────────────────────────────
  const usedSideA = new Set<string>();
  const usedSideB = new Set<string>();

  const deduped = keepIndices
    .filter(i => Number.isInteger(i) && i >= 0 && i < chainObjects.length)
    .map(i => chainObjects[i])
    .filter(chain => {
      const sideAIds = chain.sideAMarkets.map(m => m.conditionId);
      const sideBIds = chain.sideBMarkets.map(m => m.conditionId);
      const sideAOverlap = sideAIds.filter(id => usedSideA.has(id)).length;
      const sideBOverlap = sideBIds.filter(id => usedSideB.has(id)).length;
      if (sideAOverlap > sideAIds.length * 0.5) return false;
      if (sideBOverlap > sideBIds.length * 0.5) return false;
      sideAIds.forEach(id => usedSideA.add(id));
      sideBIds.forEach(id => usedSideB.add(id));
      return true;
    });

  const finalChains: CrossChain[] = [];
  for (const chain of deduped) {
    const allMkts = [...chain.sideAMarkets, ...chain.sideBMarkets];
    const totalVolume = allMkts.reduce((s, m) => s + (parseFloat(m.volume24hr as any) || 0), 0);
    const groupA = chain.sideAMarkets.map(enrichMarket).filter((m): m is ChainMarket => m !== null);
    const groupB = chain.sideBMarkets.map(enrichMarket).filter((m): m is ChainMarket => m !== null);
    if (groupA.length < 2 || groupB.length < 2) continue;
    finalChains.push({
      theme: chain.theme || "Causal Chain",
      description: chain.description || "",
      emoji: chain.emoji || "\uD83D\uDD17",
      groupALabel: chain.sideA_label || "CAUSE",
      groupBLabel: chain.sideB_label || "EFFECT",
      groupA,
      groupB,
      totalVolume,
      source: "ai" as const,
    });
  }

  console.log("Final chains:", finalChains.length);
  return finalChains.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 20);
}

// ── Cross-category causal chains — fully AI-driven ───────────────────────────
export function useCausalChains() {
  const qc = useQueryClient();
  const { data: allMarkets = [], isLoading: marketsLoading, error, refetch: refetchMarkets, isFetching } = useAllMarkets();

  const { data: chains = [], isLoading: aiLoading } = useQuery({
    queryKey: ["ai-chains-v2", allMarkets.length > 0 ? allMarkets[0]?.id : "empty"],
    queryFn: () => fetchAiChains(allMarkets),
    enabled: allMarkets.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const refetch = async () => {
    await refetchMarkets();
    await qc.invalidateQueries({ queryKey: ["ai-chains-v2"] });
  };

  const sorted = [...chains].sort((a, b) => b.totalVolume - a.totalVolume);

  return {
    chains: sorted,
    isLoading: marketsLoading,
    aiLoading,
    error,
    refetch,
    isFetching,
  };
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

// ── Spread scanner — Phase 1: all 500 via Gamma, Phase 2: CLOB top 50 ────────
export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      const pages = await Promise.all(
        [0, 100, 200, 300, 400].map(offset =>
          fetch(`${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`)
            .then(r => (r.ok ? r.json() : []))
        )
      );
      const allMarkets: GammaMarket[] = (pages.flat() as GammaMarket[])
        .filter(m => m.active === true && m.closed === false);

      const candidates = allMarkets
        .filter(m => {
          const bid = parseFloat(m.bestBid as any);
          const ask = parseFloat(m.bestAsk as any);
          const vol = parseFloat(m.volume24hr as any);
          if (!bid || !ask) return false;
          if (bid < 0.05 || ask > 0.95) return false;
          if (vol < 1000) return false;
          return (ask - bid) > 0.01;
        })
        .sort((a, b) => {
          const spreadA = parseFloat(a.bestAsk as any) - parseFloat(a.bestBid as any);
          const spreadB = parseFloat(b.bestAsk as any) - parseFloat(b.bestBid as any);
          return spreadB - spreadA;
        })
        .slice(0, 50);

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
            if (spread < 0.01) return null;
            return { market: m, bestBid, bestAsk, spread };
          } catch {
            return null;
          }
        })
      );

      const valid = results
        .filter((r): r is SpreadData => r !== null)
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
