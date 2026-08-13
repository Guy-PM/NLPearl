import { PrismaClient } from "./generated/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.flowConfig.upsert({
    where: { flowType: "kyc_reminder" },
    update: {},
    create: {
      flowType: "kyc_reminder",
      nlpearlOutboundId: "REPLACE_WITH_NLPEARL_OUTBOUND_ID",
      preliminarySmsTemplate:
        "Hi {{name}}, we'll be calling you shortly to help you finish your KYC.",
      consentSmsTemplate: "Here's the link to complete your KYC: {{cfaUrl}}",
      delayMinutes: 10,
      enabled: true,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
