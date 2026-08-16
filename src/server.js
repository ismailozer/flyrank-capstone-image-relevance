require("dotenv").config();

const app = require("./app");
const pool = require("./db/pool");

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("[database] PostgreSQL connection established");

    const server = app.listen(PORT, () => {
      console.log(`[server] API running at http://localhost:${PORT}`);
      console.log(`[server] Health check: http://localhost:${PORT}/health`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[server] received ${signal}, shutting down...`);

      server.close(async () => {
        await pool.end();

        console.log("[server] shutdown complete");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("[server] startup failed:", error);
    await pool.end();
    process.exit(1);
  }
}

startServer();