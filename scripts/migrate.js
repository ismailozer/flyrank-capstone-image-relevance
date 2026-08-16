require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../src/db/pool");

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);

    const migrationsDirectory = path.join(
      __dirname,
      "..",
      "sql",
      "migrations"
    );

    const migrationFiles = fs
      .readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const appliedResult = await client.query(
      "SELECT filename FROM schema_migrations ORDER BY filename"
    );

    const appliedMigrations = new Set(
      appliedResult.rows.map((row) => row.filename)
    );

    for (const file of migrationFiles) {
      if (appliedMigrations.has(file)) {
        console.log(`[migration] already applied: ${file}`);
        continue;
      }

      const migrationPath = path.join(migrationsDirectory, file);
      const sql = fs.readFileSync(migrationPath, "utf8");

      console.log(`[migration] applying: ${file}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          `
          INSERT INTO schema_migrations (filename)
          VALUES ($1)
          `,
          [file]
        );

        await client.query("COMMIT");

        console.log(`[migration] completed: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("[migration] all migrations completed");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error("[migration] failed");
  console.error(error);
  process.exit(1);
});