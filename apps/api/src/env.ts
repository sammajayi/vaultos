import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the monorepo-root .env regardless of cwd.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const addr = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const Env = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(8),
  ARC_RPC_URL: z.string().url(),
  ARC_CHAIN_ID: z.coerce.number(),
  ARC_USDC_ADDRESS: addr,
  TREASURY_FACTORY_ADDRESS: addr,
  AGENT_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key"),
  // Lets a demo "attack" the treasury through the real contract (dry-run, never sent).
  ENABLE_ATTACK_SIMULATION: z.enum(["true", "false"]).default("true"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  console.error("\nSee .env.example");
  process.exit(1);
}
export const env = parsed.data;
