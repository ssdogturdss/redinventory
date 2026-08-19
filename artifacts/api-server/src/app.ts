import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { requireAuth } from "./middleware/auth";
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
// CORS — allow explicit origins via CORS_ORIGIN (comma-separated) or permit
// all origins when unset (development default).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin
      ? corsOrigin.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Auth middleware — exempt healthz and auth/* routes
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  if (path === "/healthz" || path.startsWith("/auth/")) {
    return next();
  }
  return requireAuth(req, res, next);
});

app.use("/api", router);

export default app;
