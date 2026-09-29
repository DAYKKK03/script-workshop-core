import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const inviteCodes = (process.env.SEED_INVITE_CODES || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  for (const code of inviteCodes) {
    await prisma.inviteCode.upsert({
      where: { code },
      update: {},
      create: { code }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // 安全错误摘要：不暴露数据库 URL、密码、堆栈等信息
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isConnectionError =
      errorMessage.includes("connect") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("P1001") || // Prisma: can't reach database
      errorMessage.includes("P1002"); // Prisma: database server not found

    if (isConnectionError) {
      console.error("Database seed failed");
      console.error("unable to connect to database");
    } else {
      console.error("Database seed failed");
      console.error("database operation error");
    }
    await prisma.$disconnect();
    process.exit(1);
  });
