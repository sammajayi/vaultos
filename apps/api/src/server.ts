import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./env";
import { db } from "./db";
import { AGENT_ADDRESS, networkName } from "./chain";
import { coreRoutes } from "./routes/core";
import { invoiceRoutes } from "./routes/invoices";
import { agentRoutes } from "./routes/agent";

const app = Fastify({ logger: { level: "info" } });
await app.register(cors, { origin: env.WEB_ORIGIN.split(","), allowedHeaders: ["content-type", "authorization"] });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  app.log.error(err);
  const status = err.statusCode ?? 500;
  reply.code(status).send({ error: status === 500 ? "Internal error." : err.message });
});

await app.register(coreRoutes);
await app.register(invoiceRoutes);
await app.register(agentRoutes);

await db.$connect();
await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
app.log.info(`VaultOS API on :${env.API_PORT} — ${networkName}, agent ${AGENT_ADDRESS}`);
