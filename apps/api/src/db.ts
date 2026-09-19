import { PrismaClient } from "@prisma/client";

// JSON-serialise BigInt (USDC base units) as strings everywhere.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export const db = new PrismaClient();
