const express = require("express");
const healthRouter = require("./routes/health");

const app = express();

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use("/health", healthRouter);

app.use((req, res) => {
  return res.status(404).json({
    error: "not_found",
    message: "The requested endpoint does not exist.",
  });
});

app.use((error, req, res, next) => {
  console.error("[api] unhandled error:", error);

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "payload_too_large",
      message: "Request payload exceeds the allowed size.",
    });
  }

  return res.status(500).json({
    error: "internal_server_error",
    message: "An unexpected error occurred.",
  });
});

module.exports = app;