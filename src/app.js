const express = require("express");

const healthRouter = require("./routes/health");
const imagesRouter = require("./routes/images");
const jobsRouter = require("./routes/jobs");
const postsRouter = require("./routes/posts");
const reviewsRouter = require("./routes/reviews");

const app = express();

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use("/health", healthRouter);
app.use("/images", imagesRouter);
app.use("/jobs", jobsRouter);
app.use("/posts", postsRouter);
app.use("/reviews", reviewsRouter);

app.use((req, res) => {
  return res.status(404).json({
    error: "not_found",
    message:
      "The requested endpoint does not exist.",
  });
});

app.use((error, req, res, next) => {
  /*
   * Malformed JSON.
   *
   * Example:
   * {"tenant_id": 1,
   */
  if (
    error?.type ===
    "entity.parse.failed"
  ) {
    return res.status(400).json({
      error: "invalid_json",
      message:
        "Request body contains invalid JSON.",
    });
  }

  /*
   * express.json() payload limit.
   */
  if (
    error?.type ===
    "entity.too.large"
  ) {
    return res.status(413).json({
      error: "payload_too_large",
      message:
        "Request payload exceeds the allowed size.",
    });
  }

  /*
   * Multer image size limit.
   */
  if (
    error?.code ===
    "LIMIT_FILE_SIZE"
  ) {
    return res.status(413).json({
      error: "image_too_large",
      message:
        "Image size must not exceed 8 MB.",
    });
  }

  /*
   * Multer unexpected field.
   *
   * The API expects:
   *
   * image=<file>
   */
  if (
    error?.code ===
    "LIMIT_UNEXPECTED_FILE"
  ) {
    return res.status(400).json({
      error: "unexpected_file_field",
      message:
        "The image must be uploaded using the 'image' field.",
    });
  }

  /*
   * Other client-side Multer validation
   * errors.
   */
  if (
    error?.name ===
    "MulterError"
  ) {
    return res.status(400).json({
      error:
        "upload_validation_error",
      message:
        "The uploaded file request is invalid.",
    });
  }

  /*
   * Unsupported MIME type raised by
   * src/routes/images.js.
   */
  if (
    error?.message ===
    "Only JPEG, PNG and WebP images are supported."
  ) {
    return res.status(415).json({
      error:
        "unsupported_media_type",
      message: error.message,
    });
  }

  /*
   * Only unexpected server errors reach
   * this point.
   */
  console.error(
    "[api] unhandled error:",
    error
  );

  if (
    error?.code ===
    "AI_BUDGET_EXCEEDED"
  ) {
    return res.status(429).json({
      error:
        "ai_budget_exceeded",

      message:
        error.message,

      budget: {
        currentSpend:
          error.currentSpend,

        estimatedNextCostUsd:
          error.estimatedNextCostUsd,

        projectedSpend:
          error.projectedSpend,

        limit:
          error.budget,
      },
    });
  }

  return res.status(500).json({
    error:
      "internal_server_error",
    message:
      "An unexpected error occurred.",
  });
});

module.exports = app;