const express = require("express");
const healthRouter = require("./routes/health");
const imagesRouter = require("./routes/images");

const app = express();

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use("/health", healthRouter);

app.use("/images", imagesRouter);

app.use((req, res) => {
  return res.status(404).json({
    error: "not_found",
    message: "The requested endpoint does not exist.",
  });
});

app.use((error, req, res, next) => {
  console.error("[api] unhandled error:", error);

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "image_too_large",
      message:
        "Image size must not exceed 8 MB.",
    });
  }

  if (
    error?.message ===
    "Only JPEG, PNG and WebP images are supported."
  ) {
    return res.status(415).json({
      error: "unsupported_media_type",
      message: error.message,
    });
  }

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