require("dotenv").config();

const {
  claimNextJob,
  getRunnableItems,
  markItemRunning,
  markItemCompleted,
  markItemFailed,
  deferItemForProviderLimit,
  refreshJobProgress,
  markJobCompleted,
  markJobForRetry,
  markJobForProviderCooldown,
  markJobFailed,
} = require(
  "../src/repositories/backgroundJobRepository"
);

const {
  getImageById,
} = require(
  "../src/repositories/imageRepository"
);

const {
  processImage,
} = require(
  "../src/services/imageProcessingService"
);

const {
  generateImageEmbedding,
} = require(
  "../src/services/imageEmbeddingService"
);

const {
  getImageEmbedding,
} = require(
  "../src/repositories/embeddingRepository"
);


const POLL_INTERVAL_MS = 2000;

const BETWEEN_ITEMS_DELAY_MS =
  1000;

const NON_RATE_LIMIT_MAX_ATTEMPTS =
  3;

const NON_RATE_LIMIT_BASE_DELAY_MS =
  2000;

const NON_RATE_LIMIT_MAX_DELAY_MS =
  15000;

const DEFAULT_RATE_LIMIT_DELAY_MS =
  60000;

const RATE_LIMIT_SAFETY_MS =
  2000;


function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


function getErrorMessage(
  error
) {
  if (!error) {
    return "";
  }

  if (
    typeof error.message ===
    "string"
  ) {
    return error.message;
  }

  return String(error);
}


function isRateLimitError(
  error
) {
  const message =
    getErrorMessage(
      error
    ).toLowerCase();

  return (
    message.includes("429") ||
    message.includes(
      "quota exceeded"
    ) ||
    message.includes(
      "resource_exhausted"
    ) ||
    message.includes(
      "rate limit"
    )
  );
}


function parseProviderRetryDelayMs(
  error
) {
  const message =
    getErrorMessage(error);

  const match =
    message.match(
      /Please retry in\s+([\d.]+)s/i
    );

  if (!match) {
    return null;
  }

  const seconds =
    Number(match[1]);

  if (
    !Number.isFinite(
      seconds
    ) ||
    seconds < 0
  ) {
    return null;
  }

  return (
    Math.ceil(
      seconds * 1000
    ) +
    RATE_LIMIT_SAFETY_MS
  );
}


function isTransientNonRateLimitError(
  error
) {
  const message =
    getErrorMessage(
      error
    ).toLowerCase();

  if (
    isRateLimitError(
      error
    )
  ) {
    return false;
  }

  return (
    message.includes(
      "typeerror: unusable"
    ) ||
    message.includes(
      "fetch failed"
    ) ||
    message.includes(
      "econnreset"
    ) ||
    message.includes(
      "etimedout"
    ) ||
    message.includes(
      "socket hang up"
    ) ||
    message.includes(
      "http 408"
    ) ||
    message.includes(
      "http 500"
    ) ||
    message.includes(
      "http 502"
    ) ||
    message.includes(
      "http 503"
    ) ||
    message.includes(
      "http 504"
    )
  );
}


function getJitterMs() {
  return Math.floor(
    250 +
      Math.random() * 750
  );
}


function getNonRateLimitDelayMs(
  attempt
) {
  const exponential =
    NON_RATE_LIMIT_BASE_DELAY_MS *
    2 ** (attempt - 1);

  return Math.min(
    exponential +
      getJitterMs(),

    NON_RATE_LIMIT_MAX_DELAY_MS
  );
}


class ProviderRateLimitError
  extends Error {
  constructor({
    originalError,
    retryAfterMs,
  }) {
    super(
      getErrorMessage(
        originalError
      )
    );

    this.name =
      "ProviderRateLimitError";

    this.code =
      "PROVIDER_RATE_LIMIT";

    this.retryAfterMs =
      retryAfterMs;

    this.originalError =
      originalError;
  }
}


async function executeProviderOperation({
  label,
  operation,
}) {
  let lastError;


  for (
    let attempt = 1;
    attempt <=
      NON_RATE_LIMIT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError =
        error;


      /*
       * A 429 is provider-wide for the
       * current quota window.
       *
       * Do not repeatedly hit Gemini
       * from this individual image.
       * Pause the entire batch instead.
       */
      if (
        isRateLimitError(
          error
        )
      ) {
        const retryAfterMs =
          parseProviderRetryDelayMs(
            error
          ) ||
          DEFAULT_RATE_LIMIT_DELAY_MS;


        throw new ProviderRateLimitError({
          originalError:
            error,

          retryAfterMs,
        });
      }


      const transient =
        isTransientNonRateLimitError(
          error
        );

      const finalAttempt =
        attempt ===
        NON_RATE_LIMIT_MAX_ATTEMPTS;


      if (
        !transient ||
        finalAttempt
      ) {
        throw error;
      }


      const delayMs =
        getNonRateLimitDelayMs(
          attempt
        );


      console.warn(
        `[worker] ${label} transient error; ` +
          `attempt ${attempt}/${NON_RATE_LIMIT_MAX_ATTEMPTS}. ` +
          `Retrying in ${(delayMs / 1000).toFixed(
            1
          )}s`
      );


      await sleep(
        delayMs
      );
    }
  }


  throw lastError;
}


async function ensureImageEmbedding({
  imageId,
  processingStatus,
}) {
  if (
    processingStatus ===
    "review_required"
  ) {
    console.log(
      `[worker] image ${imageId} requires review; embedding skipped`
    );

    return {
      skipped: true,
      reason:
        "review_required",
    };
  }


  const existingEmbedding =
    await getImageEmbedding(
      imageId
    );


  if (existingEmbedding) {
    console.log(
      `[worker] image ${imageId} embedding already exists`
    );

    return {
      skipped: true,

      reason:
        "already_exists",

      embeddingId:
        existingEmbedding.id,
    };
  }


  console.log(
    `[worker] generating embedding for image ${imageId}`
  );


  const embedding =
    await executeProviderOperation({
      label:
        `image ${imageId} embedding`,

      operation: () =>
        generateImageEmbedding(
          imageId
        ),
    });


  console.log(
    `[worker] image ${imageId} embedding completed`
  );


  return {
    skipped: false,
    embedding,
  };
}


async function processJobItem(
  item
) {
  const image =
    await getImageById(
      item.image_id
    );


  if (!image) {
    throw new Error(
      `Image ${item.image_id} does not exist.`
    );
  }


  /*
   * Recovery / idempotency:
   * never repeat completed vision work.
   */
  if (
    image.processing_status ===
      "processed" ||
    image.processing_status ===
      "review_required"
  ) {
    console.log(
      `[worker] image ${item.image_id} already ${image.processing_status}; vision skipped`
    );


    await ensureImageEmbedding({
      imageId:
        item.image_id,

      processingStatus:
        image.processing_status,
    });


    return;
  }


  const processingResult =
    await executeProviderOperation({
      label:
        `image ${item.image_id} vision`,

      operation: () =>
        processImage(
          item.image_id
        ),
    });


  console.log(
    `[worker] image ${item.image_id} vision processing completed`
  );


  await ensureImageEmbedding({
    imageId:
      item.image_id,

    processingStatus:
      processingResult
        .processingStatus,
  });
}


async function pauseJobForRateLimit({
  job,
  item,
  error,
}) {
  const retryAfterMs =
    Math.max(
      1000,
      error.retryAfterMs
    );


  console.warn(
    `[worker] provider rate limit reached while processing image ${item.image_id}`
  );

  console.warn(
    `[worker] pausing job ${job.id} for ${(retryAfterMs / 1000).toFixed(
      1
    )}s`
  );


  /*
   * markItemRunning() consumed one
   * item attempt. Put it back without
   * consuming that retry budget.
   */
  await deferItemForProviderLimit(
    item.id,
    error.message
  );


  await refreshJobProgress(
    job.id
  );


  /*
   * claimNextJob() consumed one job
   * attempt. Provider cooldowns should
   * not consume that retry budget.
   */
  await markJobForProviderCooldown({
    jobId:
      job.id,

    delayMs:
      retryAfterMs,

    errorMessage:
      error.message,
  });
}


async function processJob(
  job
) {
  console.log(
    `[worker] processing job ${job.id}`
  );


  const items =
    await getRunnableItems(
      job.id
    );


  for (
    const item
    of items
  ) {
    try {
      console.log(
        `[worker] image ${item.image_id}, attempt ${
          item.attempt_count + 1
        }/${item.max_attempts}`
      );


      await markItemRunning(
        item.id
      );


      await processJobItem(
        item
      );


      await markItemCompleted(
        item.id
      );


      console.log(
        `[worker] image ${item.image_id} completed`
      );
    } catch (error) {
      if (
        error instanceof
        ProviderRateLimitError
      ) {
        await pauseJobForRateLimit({
          job,
          item,
          error,
        });


        /*
         * Critical:
         * stop this entire batch pass.
         * Do not touch later images.
         */
        return;
      }


      console.error(
        `[worker] image ${item.image_id} failed: ${getErrorMessage(
          error
        )}`
      );


      await markItemFailed(
        item.id,
        getErrorMessage(
          error
        )
      );
    }


    await refreshJobProgress(
      job.id
    );


    await sleep(
      BETWEEN_ITEMS_DELAY_MS
    );
  }


  const progress =
    await refreshJobProgress(
      job.id
    );


  if (
    progress.remaining > 0
  ) {
    if (
      job.attempt_count <
      job.max_attempts
    ) {
      console.log(
        `[worker] job ${job.id} will retry`
      );


      await markJobForRetry(
        job.id
      );


      return;
    }


    await markJobFailed(
      job.id,
      "One or more images exhausted their retry attempts."
    );


    return;
  }


  if (
    progress.permanently_failed >
    0
  ) {
    await markJobFailed(
      job.id,
      `${progress.permanently_failed} image(s) permanently failed.`
    );


    return;
  }


  await markJobCompleted(
    job.id
  );


  console.log(
    `[worker] job ${job.id} completed`
  );
}


async function runWorker() {
  console.log(
    "[worker] image processing worker started"
  );


  while (true) {
    try {
      const job =
        await claimNextJob();


      if (!job) {
        await sleep(
          POLL_INTERVAL_MS
        );

        continue;
      }


      await processJob(
        job
      );
    } catch (error) {
      console.error(
        "[worker] unexpected error:",
        error
      );


      await sleep(
        POLL_INTERVAL_MS
      );
    }
  }
}


runWorker();