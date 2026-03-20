import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

// Serve built frontend — try several candidate paths to handle different CWDs
const candidatePaths = [
  path.resolve(process.cwd(), "artifacts/polymarket-dashboard/dist/public"),
  path.resolve(process.cwd(), "../polymarket-dashboard/dist/public"),
  path.resolve(__dirname, "../../polymarket-dashboard/dist/public"),
];

const frontendDist = candidatePaths.find(p => existsSync(p));

if (frontendDist) {
  logger.info({ frontendDist }, "Serving frontend from");
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  logger.warn({ tried: candidatePaths }, "Frontend dist not found, serving API only");
  app.get("*", (_req, res) => {
    res.status(200).json({ status: "ok", message: "Polymarket API is running. Frontend not found." });
  });
}

export default app;
