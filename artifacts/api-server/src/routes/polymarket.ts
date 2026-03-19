import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

async function proxyGet(url: string, res: any) {
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `Upstream error: ${response.status}` });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Proxy error" });
  }
}

router.get("/polymarket/events", async (req, res) => {
  const limit = req.query.limit ?? 50;
  const active = req.query.active ?? "true";
  const closed = req.query.closed ?? "false";
  const order = req.query.order ?? "volume24hr";
  const ascending = req.query.ascending ?? "false";
  await proxyGet(`${GAMMA_BASE}/events?limit=${limit}&active=${active}&closed=${closed}&order=${order}&ascending=${ascending}`, res);
});

router.get("/polymarket/markets", async (req, res) => {
  const limit = req.query.limit ?? 100;
  const active = req.query.active ?? "true";
  const closed = req.query.closed ?? "false";
  const order = req.query.order ?? "volume24hr";
  const ascending = req.query.ascending ?? "false";
  await proxyGet(`${GAMMA_BASE}/markets?limit=${limit}&active=${active}&closed=${closed}&order=${order}&ascending=${ascending}`, res);
});

router.get("/polymarket/book", async (req, res) => {
  const tokenId = req.query.token_id;
  if (!tokenId) {
    res.status(400).json({ error: "token_id is required" });
    return;
  }
  await proxyGet(`${CLOB_BASE}/book?token_id=${tokenId}`, res);
});

router.get("/polymarket/prices-history", async (req, res) => {
  const market = req.query.market;
  const interval = req.query.interval ?? "1h";
  if (!market) {
    res.status(400).json({ error: "market is required" });
    return;
  }
  await proxyGet(`${CLOB_BASE}/prices-history?market=${market}&interval=${interval}`, res);
});

export default router;
