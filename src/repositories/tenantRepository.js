const pool = require("../db/pool");

async function findTenantByName(name) {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        ai_budget_usd,
        created_at
      FROM tenants
      WHERE name = $1
      ORDER BY id ASC
      LIMIT 1
    `,
    [name]
  );

  return result.rows[0] || null;
}

async function createTenant({
  name,
  aiBudgetUsd = 1,
}) {
  const result = await pool.query(
    `
      INSERT INTO tenants (
        name,
        ai_budget_usd
      )
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        ai_budget_usd,
        created_at
    `,
    [name, aiBudgetUsd]
  );

  return result.rows[0];
}

module.exports = {
  findTenantByName,
  createTenant,
};