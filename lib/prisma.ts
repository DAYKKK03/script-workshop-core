import { PrismaClient } from "@prisma/client";
import { getPrismaLogLevels } from "@/lib/prisma-config";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: getPrismaLogLevels()
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
