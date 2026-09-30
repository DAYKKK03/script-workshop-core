import type { Prisma } from "@prisma/client";

export function getPrismaLogLevels(
  nodeEnv = process.env.NODE_ENV
): Prisma.LogLevel[] {
  return nodeEnv === "development" ? ["warn"] : [];
}
