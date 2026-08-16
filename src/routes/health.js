const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS database_time, current_database() AS database_name"
    );

    return res.status(200).json({
      status: "ok",
      service: "image-relevance-api",
      database: {
        status: "connected",
        name: result.rows[0].database_name,
        time: result.rows[0].database_time,
      },
    });
  } catch (error) {
    console.error("[health] database check failed:", error.message);

    return res.status(503).json({
      status: "error",
      service: "image-relevance-api",
      database: {
        status: "unavailable",
      },
    });
  }
});

module.exports = router;