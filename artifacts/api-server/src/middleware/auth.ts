import { type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[FATAL] JWT_SECRET environment variable is not set. " +
        "Refusing to start in production without a secure secret. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\" " +
        "and set it as the JWT_SECRET environment variable."
      );
      process.exit(1);
    }
    const generated = crypto.randomBytes(48).toString("hex");
    console.warn(
      "\n" +
      "╔══════════════════════════════════════════════════════════════════╗\n" +
      "║  JWT_SECRET is not set — a temporary key has been generated.    ║\n" +
      "║  All sessions will be invalidated when the server restarts.     ║\n" +
      "║                                                                  ║\n" +
      "║  Set this as a permanent environment variable:                  ║\n" +
      `║  JWT_SECRET=${generated}  ║\n` +
      "╚══════════════════════════════════════════════════════════════════╝\n"
    );
    return generated;
  }
  return secret;
}

export const JWT_SECRET = resolveJwtSecret();
export const JWT_EXPIRES_IN = "7d";

export type AuthEmployee = {
  id: number;
  username: string;
  role: "admin" | "employee";
  storeId: number | null;
};

declare global {
  namespace Express {
    interface Request {
      employee?: AuthEmployee;
    }
  }
}

export function signToken(payload: AuthEmployee): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthEmployee | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthEmployee;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.employee = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.employee || req.employee.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
