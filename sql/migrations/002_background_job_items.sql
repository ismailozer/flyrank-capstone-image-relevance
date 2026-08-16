ALTER TABLE background_jobs
ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS background_job_items (
    id BIGSERIAL PRIMARY KEY,

    job_id BIGINT NOT NULL
        REFERENCES background_jobs(id)
        ON DELETE CASCADE,

    image_id BIGINT NOT NULL
        REFERENCES images(id)
        ON DELETE CASCADE,

    status VARCHAR(30) NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'running',
                'completed',
                'failed'
            )
        ),

    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (job_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_background_job_items_job
    ON background_job_items(job_id);

CREATE INDEX IF NOT EXISTS idx_background_job_items_status
    ON background_job_items(status, created_at);

CREATE INDEX IF NOT EXISTS idx_background_jobs_next_attempt
    ON background_jobs(status, next_attempt_at);