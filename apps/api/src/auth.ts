import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyMessage, type Address } from "viem";
import { loginMessage } from "@vaultos/sdk";
import { env } from "./env";

const TTL_MS = 12 * 60 * 60 * 1000;
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");

export function issueToken(address: string) {
  const payload = b64(JSON.stringify({ a: address.toLowerCase(), e: Date.now() + TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof a === "string" && e > Date.now() ? a : null;
  } catch {
    return null;
  }
}

/** Wallet sign-in: the signed message embeds an issue time, valid for 10 minutes. */
export async function verifyLogin(address: string, issuedAt: string, signature: `0x${string}`) {
  const age = Date.now() - Date.parse(issuedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 10 * 60_000) return false;
  return verifyMessage({ address: address as Address, message: loginMessage(address, issuedAt), signature });
}

declare module "fastify" {
  interface FastifyRequest {
    wallet: string;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const wallet = readToken(header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!wallet) return reply.code(401).send({ error: "Sign in with your wallet to continue." });
  req.wallet = wallet;
}
