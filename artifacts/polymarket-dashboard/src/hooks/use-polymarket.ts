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

  const catSummary = Object.entries(byCategory)
    .map(([k, v]) => `${k}:${v.length}`)
    .join(", ");
  console.log("Markets by category:", catSummary);

  const diverse: GammaMarket[] = [];
  for (const cat of Object.keys(byCategory)) {
    const top15 = byCategory[cat]
      .sort((a, b) => parseFloat(b.volume24hr as any) - parseFloat(a.volume24hr as any))
      .slice(0, 15);
    diverse.push(...top15);
  }

  // Deduplicate by conditionId
  const seen = new Set<string>();
  const final = diverse.filter(m => {
    if (seen.has(m.conditionId)) return false;
    seen.add(m.conditionId);
    return true;
  });

  console.log("Diverse set size:", final.length, "| Categories:", Object.keys(byCategory).join(", "));
  return final;
}

// ── Build Claude prompt with category-labeled markets ────────────────────────
function buildChainPrompt(markets: GammaMarket[]): string {
  const lines = markets.map((m, i) => {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    const vol = parseFloat(m.volume24hr as any) || 0;
    const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any) || 0;
    const dir = change > 0.03 ? "\u25b2" : change < -0.03 ? "\u25bc" : "=";
    const cat = categorizeMarket(m).toUpperCase();
    return `${i}.[${cat}] ${m.question} | ${(yes * 100).toFixed(0)}% | $${(vol / 1000).toFixed(0)}K | ${dir}`;
  });

  const marketList = lines.join("\n");
  const maxIdx = markets.length - 1;

  return (
    `You are a senior macro trader. These are ALL active Polymarket markets right now, organized by category:\n\n` +
    `${marketList}\n\n` +
    `Find 15-20 causal chains where markets from DIFFERENT categories move together.\n\n` +
    `The category tags [CONFLICT], [ENERGY], [MONETARY], [CRYPTO], [USPOLITICS], [CHINA], [EQUITIES], [ECONOMICS], [LEADERSHIP], [POLICY], [CURRENCY], [DIPLOMACY] show you what each market is about.\n\n` +
    `A valid chain MUST connect two DIFFERENT category tags. Examples:\n` +
    `- [CONFLICT] \u2192 [ENERGY]: Iran invasion disrupts Hormuz, oil spikes \u2705\n` +
    `- [MONETARY] \u2192 [CRYPTO]: Fed holds rates, Bitcoin drops \u2705\n` +
    `- [USPOLITICS] \u2192 [POLICY]: Democrats win Senate, climate bill passes \u2705\n` +
    `- [CHINA] \u2192 [ECONOMICS]: Trump tariffs on China, US recession risk rises \u2705\n` +
    `- [LEADERSHIP] \u2192 [DIPLOMACY]: Netanyahu removed, Gaza ceasefire possible \u2705\n` +
    `- [CONFLICT] \u2192 [LEADERSHIP]: Iran regime falls, Netanyahu threat removed \u2705\n` +
    `- [MONETARY] \u2192 [EQUITIES]: Fed cuts rates, S&P rallies \u2705\n` +
    `- [CHINA] \u2192 [DIPLOMACY]: China invades Taiwan, Trump-Xi summit impossible \u2705\n` +
    `- [ENERGY] \u2192 [MONETARY]: Oil spikes cause inflation, Fed delays cuts \u2705\n` +
    `- [CONFLICT] \u2192 [CURRENCY]: War escalates, dollar strengthens as safe haven \u2705\n` +
    `- [ECONOMICS] \u2192 [MONETARY]: Recession hits, Fed forced to cut rates \u2705\n` +
    `- [USPOLITICS] \u2192 [ECONOMICS]: Republicans win Congress, tax cuts extend \u2705\n\n` +
    `STEP 1: Find potential causal groups across different categories.\n\n` +
    `STEP 2: For each group, ask yourself these exact questions:\n` +
    `- "If market A moves 10%, would market B AUTOMATICALLY reprice within 24 hours?"\n` +
    `- "Is there a direct financial/political mechanism \u2014 not a story, a mechanism?"\n` +
    `- "Would a Bloomberg terminal show these as correlated assets?"\n\n` +
    `STEP 3: Score each chain:\n` +
    `Score 3 = DIRECT (include):\n` +
    `  Fed raises rates \u2192 Treasury yields rise (immediate automatic mechanism)\n` +
    `  Iran invades \u2192 Oil spikes (immediate supply disruption)\n` +
    `  Democrats win Senate \u2192 specific bill can pass (direct vote count)\n\n` +
    `Score 2 = INDIRECT (exclude):\n` +
    `  Iran conflict \u2192 Bitcoin drops (requires: war \u2192 risk off \u2192 crypto sells \u2192 multiple steps)\n` +
    `  Oil spikes \u2192 Tech stocks fall (requires: oil \u2192 inflation \u2192 Fed \u2192 rates \u2192 multiples \u2192 stocks)\n\n` +
    `Score 1 = STORY (exclude):\n` +
    `  War \u2192 alien disclosure (pure narrative)\n` +
    `  Oil crisis \u2192 Apple market cap (too many steps)\n\n` +
    `ONLY return Score 3 chains. If fewer than 15 Score-3 chains exist in this data, return fewer. Quality over quantity.\n\n` +
    `For each chain, write the mechanism as a single sentence starting with "BECAUSE" \u2014 if you cannot complete it cleanly in ONE step, it is Score 2 or lower and must be excluded.\n\n` +
    `Valid BECAUSE sentences:\n` +
    `- "BECAUSE Hormuz carries 20% of global oil and invasion would close it immediately"\n` +
    `- "BECAUSE Senate majority directly controls which bills get a vote"\n` +
    `- "BECAUSE Fed rate decisions immediately reprice the risk-free rate that Bitcoin competes against"\n\n` +
    `Invalid BECAUSE sentences (exclude these):\n` +
    `- "BECAUSE war creates uncertainty which affects sentiment which affects crypto" (multiple steps)\n` +
    `- "BECAUSE oil inflation might cause Fed to hold which might hurt tech multiples" (speculative)\n` +
    `- "BECAUSE regime change is a foreign policy win which might boost VP reputation" (story)\n\n` +
    `Same-category pairs are ALWAYS Score 2 or lower \u2014 never include them:\n` +
    `- [CONFLICT] \u2192 [CONFLICT], [ENERGY] \u2192 [ENERGY], [MONETARY] \u2192 [MONETARY] \u274c\n` +
    `- [CONFLICT] \u2192 [CRYPTO] or [ENERGY] \u2192 [CRYPTO]: too indirect \u274c\n\n` +
    `Only use indices that exist in the list (0\u2013${maxIdx}). Minimum 2 markets per side.\n` +
    `Specifically look for: USPOLITICS\u2192POLICY, LEADERSHIP\u2192DIPLOMACY, CHINA\u2192ECONOMICS, MONETARY\u2192EQUITIES chains.\n\n` +
    `Return ONLY JSON array, zero other text:\n` +
    `[\n` +
    `  {\n` +
    `    "theme": "Cause \u2192 Effect",\n` +
    `    "emoji": "emoji",\n` +
    `    "because": "BECAUSE [single step direct mechanism]",\n` +
    `    "description": "One sentence direct mechanism",\n` +
    `    "score": 3,\n` +
    `    "sideA_label": "CAUSE LABEL",\n` +
    `    "sideA_category": "conflict",\n` +
    `    "sideA_indices": [3, 7, 12],\n` +
    `    "sideB_label": "EFFECT LABEL",\n` +
    `    "sideB_category": "energy",\n` +
    `    "sideB_indices": [45, 67]\n` +
    `  }\n` +
    `]`
  );
}

// ── Post-filter one Claude chain response ─────────────────────────────────────
function filterChain(chain: any, markets: GammaMarket[]): CrossChain | null {
  const groupA: ChainMarket[] = (chain.sideA_indices || [])
    .filter((i: number) => Number.isInteger(i) && i >= 0 && i < markets.length)
    .map((i: number) => enrichMarket(markets[i]))
    .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

  const groupB: ChainMarket[] = (chain.sideB_indices || [])
    .filter((i: number) => Number.isInteger(i) && i >= 0 && i < markets.length)
    .map((i: number) => enrichMarket(markets[i]))
    .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

  if (groupA.length < 2 || groupB.length < 2) {
    console.log("Rejected — not enough markets:", chain.theme);
    return null;
  }

  // Reject chains Claude itself scored below 3
  if (typeof chain.score === "number" && chain.score < 3) {
    console.log("Rejected score <3:", chain.theme, `(score: ${chain.score})`);
    return null;
  }

  // Reject chains whose BECAUSE sentence contains multi-step red-flag words
  const because = (chain.because || "").toLowerCase();
  if (because) {
    const RED_FLAGS = [
      "might", "could", "sentiment", "uncertainty",
      "reputation", "perception", "narrative",
      "indirectly", "eventually", "over time", " years",
      "boost", "popularity", "fears", "concerns",
    ];
    const flagged = RED_FLAGS.find(f => because.includes(f));
    if (flagged) {
      console.log(`Rejected red-flag BECAUSE ("${flagged}"):`, chain.theme, "|", because);
      return null;
    }
  }

  // Reject same category on both sides
  const catA = (chain.sideA_category || "").toLowerCase();
  const catB = (chain.sideB_category || "").toLowerCase();
  if (catA && catB && catA === catB) {
    console.log("Rejected same category:", chain.theme, `(${catA})`);
    return null;
  }

  const textA = groupA.map(m => m.question.toLowerCase()).join(" ");
  const textB = groupB.map(m => m.question.toLowerCase()).join(" ");
  const allText = textA + " " + textB;
  const desc = (chain.description || "").toLowerCase();

  // Hard reject: sports noise
  const SPORTS_KW = [" vs ", " vs. ", " @ ", "win on 2026", "win on 2025", "nba", "nfl",
    "nhl", "mlb", "soccer", "football match", "basketball", "hockey game",
    "champions league", "premier league", "world cup", "super bowl",
    "drivers champion", "game handicap", "o/u ", "over/under", "eurovision"];
  if (SPORTS_KW.some(kw => allText.includes(kw))) return null;

  // Hard reject: alien/UFO
  if (allText.includes("alien") || allText.includes("ufo") || allText.includes("non-human")) return null;

  // Hard reject: tweet-counting
  if (allText.includes("tweets from") || allText.includes("post 2") ||
    allText.includes("post 3") || allText.includes("post 4")) return null;

  // Hard reject: conflict/energy → crypto (too indirect)
  const hasConflictA = textA.includes("iran") || textA.includes("invade") ||
    textA.includes("military") || textA.includes("ceasefire") || textA.includes("war");
  const hasEnergyA = textA.includes("crude oil") || textA.includes("oil price") || textA.includes("brent");
  const hasCryptoB = textB.includes("bitcoin") || textB.includes("ethereum") ||
    textB.includes("crypto") || textB.includes("xrp");
  if ((hasConflictA || hasEnergyA) && hasCryptoB) {
    console.log("Rejected conflict/energy→crypto:", chain.theme);
    return null;
  }

  // Hard reject: speculative framing
  if (desc.includes("tests whether") || desc.includes("safe haven test")) {
    console.log("Rejected speculative framing:", chain.theme);
    return null;
  }

  // Hard reject: war + market cap (no direct mechanism)
  const hasWar = allText.includes("invade") || allText.includes("forces enter");
  const hasMarketCap = allText.includes("largest company") || allText.includes("market cap");
  if (hasWar && hasMarketCap) return null;

  // Hard reject: circular oil↔Fed
  if (textA.includes("crude oil") && textB.includes(" fed ")) return null;
  if (textA.includes(" fed ") && textB.includes("crude oil")) return null;

  const allMkts = [...groupA, ...groupB];
  const totalVolume = allMkts.reduce((s, m) => s + parseFloat((m.volume24hr || 0) as any), 0);

  return {
    theme: chain.theme || "Causal Chain",
    description: chain.description || "",
    emoji: chain.emoji || "\uD83D\uDD17",
    groupALabel: chain.sideA_label || "CAUSE",
    groupBLabel: chain.sideB_label || "EFFECT",
    groupA,
    groupB,
    totalVolume,
    source: "ai" as const,
  };
}

// ── Parse Claude response → CrossChain[] ─────────────────────────────────────
function parseChainsFromResponse(data: any, markets: GammaMarket[]): CrossChain[] {
  try {
    const text: string = data?.content?.[0]?.text ?? "[]";
    console.log("Claude raw response start:", text.substring(0, 300));
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    const aiChains: any[] = JSON.parse(clean.slice(start, end + 1));
    console.log("Raw chains from Claude:", aiChains.length);
    return aiChains.map(c => filterChain(c, markets)).filter((c): c is CrossChain => c !== null);
  } catch (e) {
    console.error("JSON parse failed:", e);
    return [];
  }
}

// ── Fetch AI chains: category-diverse selection → one Claude call ─────────────
async function fetchAiChains(allMarkets: GammaMarket[]): Promise<CrossChain[]> {
  // Filter to uncertain, active markets with real volume
  const meaningful = allMarkets.filter(m => {
    try {
      const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
      const vol24 = parseFloat(m.volume24hr as any) || 0;
      return yes > 0.05 && yes < 0.95 && vol24 > 3000 && m.active && !m.closed;
    } catch { return false; }
  });

  // Build diverse set: top 15 per category instead of top 200 by volume
  const diverseSet = buildDiverseSet(meaningful);
  if (diverseSet.length < 20) return [];

  console.log("Sending", diverseSet.length, "markets to Claude (category-diverse)");

  const response = await fetch(`${BASE}/api/polymarket/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: buildChainPrompt(diverseSet) }],
    }),
  });

  if (!response.ok) {
    console.error("Claude API HTTP error:", response.status);
    return [];
  }
  const data = await response.json();
  if (data.error) {
    console.error("Claude API error:", JSON.stringify(data.error));
    return [];
  }

  const chains = parseChainsFromResponse(data, diverseSet);
  console.log("Valid chains after filtering:", chains.length);

  // ── Phase 1: market-reuse deduplication ──────────────────────────────────
  const usedSideAMarkets = new Set<string>();
  const usedSideBMarkets = new Set<string>();

  const deduped = chains
    .sort((a, b) => b.totalVolume - a.totalVolume)
    .filter(chain => {
      const sideAIds = chain.groupA.map(m => m.conditionId);
      const sideBIds = chain.groupB.map(m => m.conditionId);
      const sideAOverlap = sideAIds.filter(id => usedSideAMarkets.has(id)).length;
      const sideBOverlap = sideBIds.filter(id => usedSideBMarkets.has(id)).length;
      if (sideAOverlap > sideAIds.length * 0.6) return false;
      if (sideBOverlap > sideBIds.length * 0.6) return false;
      sideAIds.forEach(id => usedSideAMarkets.add(id));
      sideBIds.forEach(id => usedSideBMarkets.add(id));
      return true;
    });

  // ── Phase 2: deduplicate by identical sideA market set ───────────────────
  const seenSideA = new Set<string>();
  return deduped
    .filter(chain => {
      const key = chain.groupA.map(m => m.conditionId).sort().join(",");
      if (seenSideA.has(key)) return false;
      seenSideA.add(key);
      return true;
    })
    .slice(0, 20);
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
