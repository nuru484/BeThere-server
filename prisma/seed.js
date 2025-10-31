// prisma/seed.ts
import { role } from "@prisma/client";
import prisma from "../src/config/prisma-client.js";
import * as bcrypt from "bcrypt";
import logger from "../src/utils/logger.js";
import ENV from "../src/config/env.js";

async function main() {
  logger.info("🌱 Starting database seeding...");

  const adminEmail = ENV.ADMIN_EMAIL;
  const adminPassword = ENV.ADMIN_PASSWORD;
  const adminFirstName = ENV.ADMIN_FIRSTNAME;
  const adminLastName = ENV.ADMIN_LASTNAME;
  const adminPhone = ENV.ADMIN_PHONE;

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      firstName: adminFirstName,
      lastName: adminLastName,
      password: hashedPassword,
      role: role.ADMIN,
      phone: adminPhone,
      updatedAt: new Date(),
    },
    create: {
      email: adminEmail,
      firstName: adminFirstName,
      lastName: adminLastName,
      password: hashedPassword,
      role: role.ADMIN,
      phone: adminPhone,
    },
  });

  logger.info({
    message: "✅ Admin user seeded successfully",
    admin: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    },
  });
}

main()
  .catch((e) => {
    logger.error(e, "❌ Error during database seeding");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
