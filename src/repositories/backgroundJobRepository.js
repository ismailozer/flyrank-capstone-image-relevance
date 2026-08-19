const pool = require("../db/pool");


async function createImageProcessingJob({
  tenantId,
  imageIds,
  idempotencyKey,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (idempotencyKey) {
      const existing =
        await client.query(
          `
            SELECT *
            FROM background_jobs
            WHERE idempotency_key = $1
            LIMIT 1
          `,
          [idempotencyKey]
        );

      if (existing.rows[0]) {
        await client.query(
          "COMMIT"
        );

        return {
          job:
            existing.rows[0],
          duplicate: true,
        };
      }
    }


    const jobResult =
      await client.query(
        `
          INSERT INTO background_jobs (
            tenant_id,
            job_type,
            status,
            payload,
            total_items,
            processed_items,
            failed_items,
            attempt_count,
            max_attempts,
            idempotency_key
          )
          VALUES (
            $1,
            'image_processing',
            'queued',
            $2::jsonb,
            $3,
            0,
            0,
            0,
            3,
            $4
          )
          RETURNING *
        `,
        [
          tenantId,

          JSON.stringify({
            image_ids:
              imageIds,
          }),

          imageIds.length,

          idempotencyKey ||
            null,
        ]
      );

    const job =
      jobResult.rows[0];


    for (
      const imageId
      of imageIds
    ) {
      await client.query(
        `
          INSERT INTO background_job_items (
            job_id,
            image_id,
            status,
            attempt_count,
            max_attempts
          )
          VALUES (
            $1,
            $2,
            'queued',
            0,
            3
          )
        `,
        [
          job.id,
          imageId,
        ]
      );
    }


    await client.query(
      "COMMIT"
    );

    return {
      job,
      duplicate: false,
    };
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}


async function getJobById(
  jobId
) {
  const jobResult =
    await pool.query(
      `
        SELECT *
        FROM background_jobs
        WHERE id = $1
      `,
      [jobId]
    );

  if (
    !jobResult.rows[0]
  ) {
    return null;
  }


  const itemsResult =
    await pool.query(
      `
        SELECT
          id,
          image_id,
          status,
          attempt_count,
          max_attempts,
          error_message,
          created_at,
          started_at,
          completed_at,
          updated_at
        FROM background_job_items
        WHERE job_id = $1
        ORDER BY id
      `,
      [jobId]
    );


  return {
    ...jobResult.rows[0],

    items:
      itemsResult.rows,
  };
}


async function claimNextJob() {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const result =
      await client.query(
        `
          SELECT *
          FROM background_jobs
          WHERE
            job_type =
              'image_processing'

            AND status =
              'queued'

            AND (
              next_attempt_at IS NULL
              OR
              next_attempt_at <= NOW()
            )

          ORDER BY
            created_at ASC

          FOR UPDATE
            SKIP LOCKED

          LIMIT 1
        `
      );


    const job =
      result.rows[0];

    if (!job) {
      await client.query(
        "COMMIT"
      );

      return null;
    }


    const updated =
      await client.query(
        `
          UPDATE background_jobs
          SET
            status =
              'running',

            attempt_count =
              attempt_count + 1,

            started_at =
              COALESCE(
                started_at,
                NOW()
              ),

            error_message =
              NULL,

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
        `,
        [job.id]
      );


    await client.query(
      "COMMIT"
    );

    return updated.rows[0];
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}


async function getRunnableItems(
  jobId
) {
  const result =
    await pool.query(
      `
        SELECT *
        FROM background_job_items
        WHERE
          job_id = $1

          AND status IN (
            'queued',
            'failed'
          )

          AND attempt_count <
            max_attempts

        ORDER BY id
      `,
      [jobId]
    );

  return result.rows;
}


async function markItemRunning(
  itemId
) {
  await pool.query(
    `
      UPDATE background_job_items
      SET
        status =
          'running',

        attempt_count =
          attempt_count + 1,

        started_at =
          COALESCE(
            started_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [itemId]
  );
}


async function markItemCompleted(
  itemId
) {
  await pool.query(
    `
      UPDATE background_job_items
      SET
        status =
          'completed',

        error_message =
          NULL,

        completed_at =
          NOW(),

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [itemId]
  );
}


async function markItemFailed(
  itemId,
  errorMessage
) {
  await pool.query(
    `
      UPDATE background_job_items
      SET
        status =
          'failed',

        error_message =
          $2,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [
      itemId,

      errorMessage.slice(
        0,
        1000
      ),
    ]
  );
}


/*
 * A provider-wide rate limit must not
 * consume an item retry attempt.
 *
 * markItemRunning() already incremented
 * attempt_count, so we compensate here.
 */
async function deferItemForProviderLimit(
  itemId,
  errorMessage
) {
  await pool.query(
    `
      UPDATE background_job_items
      SET
        status =
          'queued',

        attempt_count =
          GREATEST(
            attempt_count - 1,
            0
          ),

        error_message =
          $2,

        completed_at =
          NULL,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [
      itemId,

      errorMessage.slice(
        0,
        1000
      ),
    ]
  );
}


async function refreshJobProgress(
  jobId
) {
  const result =
    await pool.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE
              status =
                'completed'
          )::int
            AS completed,

          COUNT(*) FILTER (
            WHERE
              status =
                'failed'

              AND attempt_count >=
                max_attempts
          )::int
            AS permanently_failed,

          COUNT(*) FILTER (
            WHERE
              status IN (
                'queued',
                'running'
              )

              OR (
                status =
                  'failed'

                AND attempt_count <
                  max_attempts
              )
          )::int
            AS remaining

        FROM background_job_items

        WHERE job_id = $1
      `,
      [jobId]
    );


  const progress =
    result.rows[0];


  await pool.query(
    `
      UPDATE background_jobs
      SET
        processed_items =
          $2,

        failed_items =
          $3,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [
      jobId,

      progress.completed,

      progress
        .permanently_failed,
    ]
  );


  return progress;
}


async function markJobCompleted(
  jobId
) {
  await pool.query(
    `
      UPDATE background_jobs
      SET
        status =
          'completed',

        error_message =
          NULL,

        completed_at =
          NOW(),

        next_attempt_at =
          NULL,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [jobId]
  );
}


async function markJobForRetry(
  jobId
) {
  await pool.query(
    `
      UPDATE background_jobs
      SET
        status =
          'queued',

        next_attempt_at =
          NOW() +
          INTERVAL '2 seconds',

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [jobId]
  );
}


/*
 * Provider-wide cooldown.
 *
 * This is deliberately different from
 * an ordinary job retry:
 *
 * - the job goes back to queued
 * - next_attempt_at stores the cooldown
 * - this provider pause does not consume
 *   the job retry budget
 */
async function markJobForProviderCooldown({
  jobId,
  delayMs,
  errorMessage,
}) {
  const safeDelayMs =
    Math.max(
      1000,
      Math.ceil(delayMs)
    );


  await pool.query(
    `
      UPDATE background_jobs
      SET
        status =
          'queued',

        attempt_count =
          GREATEST(
            attempt_count - 1,
            0
          ),

        next_attempt_at =
          NOW() +
          (
            $2::double precision *
            INTERVAL '1 millisecond'
          ),

        error_message =
          $3,

        completed_at =
          NULL,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [
      jobId,

      safeDelayMs,

      errorMessage.slice(
        0,
        1000
      ),
    ]
  );
}


async function markJobFailed(
  jobId,
  errorMessage
) {
  await pool.query(
    `
      UPDATE background_jobs
      SET
        status =
          'failed',

        error_message =
          $2,

        completed_at =
          NOW(),

        next_attempt_at =
          NULL,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [
      jobId,

      errorMessage.slice(
        0,
        1000
      ),
    ]
  );
}


module.exports = {
  createImageProcessingJob,
  getJobById,
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
};