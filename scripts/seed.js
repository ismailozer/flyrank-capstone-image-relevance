require("dotenv").config();

const pool = require("../src/db/pool");

const {
  findTenantByName,
  createTenant,
} = require("../src/repositories/tenantRepository");

async function seed() {
  const tenantName = "FlyRank Demo";

  try {
    let tenant = await findTenantByName(tenantName);

    if (tenant) {
      console.log("[seed] demo tenant already exists");
      console.log(tenant);
      return;
    }

    tenant = await createTenant({
      name: tenantName,
      aiBudgetUsd: 1,
    });

    console.log("[seed] demo tenant created");
    console.log(tenant);
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error("[seed] failed");
  console.error(error);
  process.exit(1);
});