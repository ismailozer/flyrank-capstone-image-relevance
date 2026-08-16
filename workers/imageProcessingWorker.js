require("dotenv").config();

const {
  claimNextJob,
  getRunnableItems,
  markItemRunning,
  markItemCompleted,
  markItemFailed,
  refreshJobProgress,
  markJobCompleted,
  markJobForRetry,
  markJobFailed,
} = require(
  "../src/repositories/backgroundJobRepository"
);

const {
  processImage,
} = require(
  "../src/services/imageProcessingService"
);

const POLL_INTERVAL_MS = 2000;

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

async function processJob(job) {
  console.log(
    `[worker] processing job ${job.id}`
  );

  const items =
    await getRunnableItems(
      job.id
    );

  for (const item of items) {
    try {
      console.log(
        `[worker] image ${item.image_id}, attempt ${
          item.attempt_count + 1
        }/${item.max_attempts}`
      );

      await markItemRunning(
        item.id
      );

      await processImage(
        item.image_id
      );

      await markItemCompleted(
        item.id
      );

      console.log(
        `[worker] image ${item.image_id} completed`
      );
    } catch (error) {
      console.error(
        `[worker] image ${item.image_id} failed: ${error.message}`
      );

      await markItemFailed(
        item.id,
        error.message
      );
    }

    await refreshJobProgress(
      job.id
    );
  }

  const progress =
    await refreshJobProgress(
      job.id
    );

  if (progress.remaining > 0) {
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
    progress.permanently_failed > 0
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

      await processJob(job);
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