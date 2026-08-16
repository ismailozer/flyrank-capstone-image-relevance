CREATE TABLE IF NOT EXISTS tenants (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    api_key_hash TEXT,
    ai_budget_usd NUMERIC(12, 6) NOT NULL DEFAULT 1.000000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS images (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    sha256 TEXT,

    processing_status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            processing_status IN (
                'pending',
                'processing',
                'processed',
                'review_required',
                'failed'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, file_path)
);

CREATE TABLE IF NOT EXISTS image_metadata (
    id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL UNIQUE
        REFERENCES images(id) ON DELETE CASCADE,

    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    attributes TEXT[] NOT NULL DEFAULT '{}',
    caption TEXT NOT NULL,

    confidence DOUBLE PRECISION NOT NULL
        CHECK (confidence >= 0 AND confidence <= 1),

    needs_review BOOLEAN NOT NULL DEFAULT FALSE,

    raw_model_output JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_tags (
    id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL
        REFERENCES images(id) ON DELETE CASCADE,

    tag TEXT NOT NULL,

    UNIQUE (image_id, tag)
);

CREATE TABLE IF NOT EXISTS image_embeddings (
    id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL UNIQUE
        REFERENCES images(id) ON DELETE CASCADE,

    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    embedding DOUBLE PRECISION[] NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL
        REFERENCES tenants(id) ON DELETE CASCADE,

    title TEXT NOT NULL,
    body TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_embeddings (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL UNIQUE
        REFERENCES posts(id) ON DELETE CASCADE,

    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    embedding DOUBLE PRECISION[] NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suggestions (
    id BIGSERIAL PRIMARY KEY,

    post_id BIGINT NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,

    image_id BIGINT NOT NULL
        REFERENCES images(id) ON DELETE CASCADE,

    rank INTEGER NOT NULL,

    similarity_score DOUBLE PRECISION NOT NULL,

    guard_decision VARCHAR(20) NOT NULL
        CHECK (guard_decision IN ('accepted', 'rejected')),

    guard_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (post_id, image_id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY,

    suggestion_id BIGINT NOT NULL
        REFERENCES suggestions(id) ON DELETE CASCADE,

    action VARCHAR(20) NOT NULL
        CHECK (action IN ('approved', 'rejected')),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS background_jobs (
    id BIGSERIAL PRIMARY KEY,

    tenant_id BIGINT
        REFERENCES tenants(id) ON DELETE CASCADE,

    job_type VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'running',
                'completed',
                'failed'
            )
        ),

    payload JSONB NOT NULL DEFAULT '{}',

    total_items INTEGER NOT NULL DEFAULT 0,
    processed_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,

    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,

    idempotency_key TEXT UNIQUE,

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_calls (
    id BIGSERIAL PRIMARY KEY,

    tenant_id BIGINT
        REFERENCES tenants(id) ON DELETE CASCADE,

    operation VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id BIGINT,

    provider VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,

    input_units INTEGER NOT NULL DEFAULT 0,
    output_units INTEGER NOT NULL DEFAULT 0,

    estimated_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,

    latency_ms INTEGER,

    status VARCHAR(20) NOT NULL
        CHECK (status IN ('success', 'failed')),

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_images_tenant
    ON images(tenant_id);

CREATE INDEX IF NOT EXISTS idx_images_processing_status
    ON images(processing_status);

CREATE INDEX IF NOT EXISTS idx_image_metadata_category
    ON image_metadata(category);

CREATE INDEX IF NOT EXISTS idx_image_metadata_review
    ON image_metadata(needs_review);

CREATE INDEX IF NOT EXISTS idx_image_tags_tag
    ON image_tags(tag);

CREATE INDEX IF NOT EXISTS idx_posts_tenant
    ON posts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_suggestions_post_rank
    ON suggestions(post_id, rank);

CREATE INDEX IF NOT EXISTS idx_suggestions_post_score
    ON suggestions(post_id, similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_suggestion
    ON reviews(suggestion_id);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status
    ON background_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_calls_entity
    ON ai_calls(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at
    ON ai_calls(created_at);