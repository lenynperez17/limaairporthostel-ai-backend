import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const msg = await prisma.messages.findFirst({
  where: {
    createdAt: { gte: new Date("2025-11-02T06:34:08Z"), lte: new Date("2025-11-02T06:34:10Z") },
    role: "ASSISTANT"
  },
  orderBy: { createdAt: "desc" }
});

console.log(msg?.content || "Not found");
await prisma.$disconnect();
