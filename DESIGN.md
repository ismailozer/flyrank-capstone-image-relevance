# Design Document

## 1. Problem

Content systems may contain large image libraries that are difficult to organize, understand, and safely match with written content.

A simple filename or keyword search is not sufficient because:

- image filenames may contain little semantic information,
- visually similar objects may represent different subjects,
- semantic similarity can rank a related but incorrect image highly,
- vision model outputs may be uncertain or malformed,
- AI calls introduce latency, cost, and provider failures.

This project addresses the problem through a backend AI pipeline that:

1\. understands images using a multimodal model,
2\. converts model output into validated structured metadata,
3\. creates semantic embeddings,
4\. ranks images against blog content,
5\. applies deterministic mismatch rules,
6\. allows the system to return no recommendation,
7\. preserves human review and operational evidence.

---

## 2. Core Principle

> A wrong recommendation is worse than no recommendation.

The system is intentionally designed to avoid always returning a result.

If no candidate passes the required confidence, subject-consistency, and semantic-similarity checks, the API returns:

```text
no_confident_match
```

This is a deliberate product and engineering decision rather than an error state.

---

## 3. High-Level Architecture

The application is separated into four major layers:

```text
HTTP API
   ↓
Services / Decision Logic
   ↓
Repositories
   ↓
PostgreSQL
```

AI providers are accessed through dedicated services rather than directly from route handlers.

The image-processing path is asynchronous:

```text
Client
   ↓
POST /images
   ↓
Persist image
   ↓
POST /jobs/image-processing
   ↓
Persist background job
   ↓
Worker
   ↓
Vision model
   ↓
Schema validation
   ↓
Metadata + tags + AI usage
   ↓
Image embedding
```

The matching path is:

```text
Validated Image Metadata
        ↓
Image Embedding

Blog Post
        ↓
Post Embedding

        ↓
Cosine Similarity
        ↓
Candidate Ranking
        ↓
Mismatch Guard
        ↓
Accepted / Rejected / No Confident Match
        ↓
Human Review
```

---

## 4. Image Ingestion Design

Uploaded images are persisted before AI processing.

Each image receives:

- tenant ownership,
- original filename,
- local file path,
- MIME type,
- SHA-256 hash,
- processing status,
- timestamps.

The SHA-256 value is used for duplicate detection.

This prevents unnecessary duplicate AI processing and reduces repeated provider cost.

Supported image types are restricted to expected image formats such as:

```text
JPEG
PNG
WebP
```

Upload size is also limited before expensive AI work begins.

---

## 5. Structured Vision Metadata

Each successfully analyzed image produces structured metadata.

Example:

```json
{
  "subject": "red fox",
  "category": "animal",
  "attributes": [
    "reddish-orange fur",
    "bushy tail",
    "pointed ears",
    "snow-covered ground"
  ],
  "caption": "A red fox walks across a snow-covered landscape.",
  "confidence": 0.98
}
```

The model response is not trusted directly.

The pipeline is:

```text
Raw provider output
        ↓
Parse
        ↓
Zod schema validation
        ↓
Validated domain object
        ↓
Persistence
```

Malformed or structurally invalid output is rejected rather than silently coerced into application data.

---

## 6. Confidence Strategy

Vision confidence is treated as an explicit reliability signal.

Configured default:

```text
VISION_CONFIDENCE_THRESHOLD=0.80
```

If:

```text
confidence < threshold
```

the image becomes:

```text
needs_review = true
processing_status = review_required
```

A `review_required` image is not automatically embedded into the semantic search corpus.

This prevents uncertain classifications from propagating into downstream recommendation decisions.

### Observed Example

An ambiguous image produced:

```text
subject: line drawing of an animal head
confidence: 0.65
```

The resulting state was:

```text
needs_review: true
processing_status: review_required
```

---

## 7. Background Processing Architecture

Vision analysis is treated as slow and failure-prone work.

For that reason it is executed through durable PostgreSQL-backed background jobs rather than inside the upload request.

The main entities are:

```text
background_jobs
background_job_items
```

A job tracks:

- job type,
- tenant,
- payload,
- status,
- total items,
- processed items,
- failed items,
- attempt count,
- maximum attempts,
- error information,
- lifecycle timestamps.

Individual images have their own job-item state.

This enables:

- progress tracking,
- retries,
- partial failure visibility,
- permanent failure reporting,
- idempotent submission.

---

## 8. Retry Strategy

Background image processing uses bounded retries.

Default:

```text
max_attempts = 3
```

A failing item progresses through:

```text
attempt 1/3
attempt 2/3
attempt 3/3
```

After the final failed attempt, the item and job are persisted as failed.

The failure is never hidden.

Provider errors are also recorded in the AI-call audit table.

---

## 9. Idempotency

Background batch creation supports an `Idempotency-Key`.

The key is scoped to the operation and tenant.

Conceptually:

```text
image-processing:<tenant>:<client-key>
```

Repeated submission of the same logical request returns the existing work instead of inserting another equivalent job.

This protects the system against:

- network retries,
- double-clicks,
- repeated client submissions,
- accidental duplicate AI usage.

---

## 10. AI Usage Attribution

AI calls are persisted in the `ai_calls` table.

Tracked properties include:

- tenant,
- operation,
- entity type,
- entity ID,
- provider,
- model,
- input units,
- output units,
- estimated cost,
- latency,
- status,
- error message.

Current operations include:

```text
vision_analysis
image_embedding
post_embedding
```

This allows operational questions such as:

```text
How much estimated AI cost did a tenant generate?
Which model failed?
How long did a call take?
Which image or post caused the call?
```

to be answered from persisted data.

---

## 11. AI Budget Guard

Each tenant has an AI budget.

Before expensive AI work, the system can compare accumulated estimated usage against the configured budget.

The goal is not payment processing.

The goal is to demonstrate cost-aware backend AI design and prevent silent uncontrolled provider usage.

---

## 12. Embedding Strategy

Only validated, automatically trusted image metadata is eligible for embedding.

The image embedding input includes semantic information such as:

```text
Subject
Category
Attributes
Caption
```

Example conceptual representation:

```text
Subject: red fox
Category: animal
Attributes: reddish-orange fur, bushy tail, pointed ears
Caption: A red fox walks across a snow-covered landscape.
```

Blog posts are represented using:

```text
Title
Content
```

Both are embedded with the same embedding model:

```text
gemini-embedding-001
```

Current dimensionality:

```text
768
```

Using the same semantic vector space makes image/post comparison possible.

---

## 13. Similarity Strategy

Image and post vectors are compared using cosine similarity.

For vectors `A` and `B`:

```text
cosine_similarity(A, B)
=
(A · B) / (||A|| × ||B||)
```

Candidate images are sorted from highest to lowest similarity.

Latest clean-machine example for a red fox post:

```text
rank | subject                             | similarity
-----+-------------------------------------+-----------
1    | red fox                             | 0.872638
2    | black wolf                          | 0.770752
3    | black and white line drawing        | 0.719947
4    | black Labrador Retriever            | 0.714552
```

The ranking successfully placed the fox first.

However, the wolf score demonstrates an important limitation:

```text
0.770752
```

is still relatively high even though a wolf is incorrect for a post specifically about foxes.

Therefore cosine similarity cannot be the final decision-maker.

---

## 14. Mismatch Guard

The mismatch guard is a deterministic decision layer placed after semantic retrieval.

It evaluates:

- vision confidence,
- semantic similarity,
- explicit subject consistency,
- semantic/tag support.

The primary threshold is configurable:

```text
MATCH_SIMILARITY_THRESHOLD=0.72
```

A stronger fallback threshold is also available:

```text
MATCH_STRONG_SIMILARITY_THRESHOLD=0.80
```

### Example: Correct Candidate

Post:

```text
The Behavior of Red Foxes
```

Candidate:

```text
subject: red fox
similarity: 0.872638
confidence: 0.98
```

Decision:

```text
accepted
```

### Example: Semantic Near-Miss

Candidate:

```text
subject: black wolf
similarity: 0.770752
confidence: 0.95
```

Although:

```text
0.770752 > 0.72
```

the candidate is rejected:

```text
decision: rejected
decision_code: subject_mismatch
```

Reason:

```text
Subject mismatch: post explicitly targets "red fox",
but the image subject is "black wolf".
```

This is one of the central design decisions of the project.

Semantic retrieval produces candidates.

The mismatch guard determines whether those candidates are safe enough to recommend.

---

## 15. Subject Detection

The guard attempts to identify explicit subjects in post text using the known subjects available in the image corpus.

Basic normalization handles differences such as:

```text
foxes  → fox
wolves → wolf
```

Descriptive modifiers such as colors are separated from the primary subject concept when appropriate.

Example:

```text
red fox
black wolf
```

The meaningful concepts remain:

```text
fox
wolf
```

This allows an explicit fox request to reject a wolf despite semantic similarity between the two animals.

---

## 16. No-Confident-Match Strategy

Returning no recommendation is a first-class successful outcome.

Example:

```text
Post:
How Commercial Airplanes Generate Lift

Available corpus:
red fox
black wolf
black Labrador Retriever
```

Observed similarities:

```text
black wolf               0.656699
red fox                  0.656260
black Labrador Retriever 0.644928
```

All candidates were rejected.

Response:

```json
{
  "status": "no_confident_match",
  "bestMatch": null
}
```

The application does not convert rank #1 into an accepted result merely because it is the highest available score.

---

## 17. Suggestion Persistence

Matching results are persisted in the `suggestions` table.

Each suggestion contains:

- post ID,
- image ID,
- rank,
- similarity score,
- guard decision,
- guard explanation,
- timestamp.

Persisting both accepted and rejected candidates provides an auditable record of how the recommendation engine behaved.

---

## 18. Human Review

Human review is stored separately from automatic decisions.

The `reviews` table contains:

- suggestion ID,
- action,
- notes,
- timestamp.

Supported actions:

```text
approved
rejected
```

This creates a separation between:

```text
AI/system decision
```

and:

```text
human reviewer decision
```

For example:

```text
automatic decision: accepted
human decision: approved
```

or:

```text
automatic decision: rejected
human decision: rejected
```

Reviews are append-only so review history remains available rather than being overwritten.

---

## 19. Main Data Models

The main PostgreSQL entities are:

### `tenants`

Represents tenant ownership and AI-budget context.

### `images`

Stores uploaded image identity and processing state.

### `image_metadata`

Stores validated structured vision output.

### `image_tags`

Stores normalized tags derived from metadata.

### `image_embeddings`

Stores semantic image vectors.

### `posts`

Stores written content to match against images.

### `post_embeddings`

Stores semantic post vectors.

### `suggestions`

Stores ranked image candidates and guard decisions.

### `reviews`

Stores human decisions and notes.

### `ai_calls`

Stores AI usage, cost, latency, and failure information.

### `background_jobs`

Stores durable asynchronous job state.

### `background_job_items`

Stores per-image execution and retry state.

### `schema_migrations`

Tracks applied database migrations.

---

## 20. API Surface

### Health

```http
GET /health
```

### Images

```http
POST /images
GET /images/:id
```

### Background Jobs

```http
POST /jobs/image-processing
GET /jobs/:id
```

### Posts and Matching

```http
POST /posts
GET /posts/:id
GET /posts/:id/images
GET /posts/:postId/images/:imageId/evaluate
```

### Human Review

```http
POST /reviews/suggestions/:suggestionId
GET /reviews/suggestions/:suggestionId
GET /reviews/suggestions/:suggestionId/latest
```

The forced-candidate evaluation endpoint exists primarily to make mismatch-guard behavior observable and testable.

---

## 21. Evaluation Strategy

The system includes both live end-to-end evaluation and deterministic unit tests.

### Capstone Evaluation Corpus

Positive cases:

```text
red fox post    → red fox
black wolf post → black wolf
Labrador post   → black Labrador Retriever
```

Negative case:

```text
airplane post → no_confident_match
```

Latest observed run:

```text
Top-1: 3/3
No-match: 1/1
Total: 4/4
Overall accuracy: 100.00%
Average winning similarity: 0.867681
Guard rejections observed: 13
```

Detailed machine-readable output is written to:

```text
docs/evaluation-results.json
```

The small evaluation set is designed to verify capstone behavior, not to claim general model accuracy.

---

## 22. Deterministic Tests

Critical non-AI decision logic is tested independently from live provider behavior.

Tests cover:

- cosine similarity,
- identical vectors,
- orthogonal vectors,
- vector dimension mismatch,
- empty vectors,
- subject normalization,
- correct subject acceptance,
- subject mismatch rejection,
- low-confidence rejection,
- low-similarity rejection.

Current result:

```text
10 passed
0 failed
```

This separation is important because live model outputs may vary slightly across calls.

Core application guardrails should remain deterministic.

---

## 23. Reliability Boundaries

The design intentionally separates probabilistic AI work from deterministic application rules.

### Probabilistic Components

```text
Vision analysis
Image metadata generation
Embeddings
```

### Deterministic Components

```text
Schema validation
Confidence threshold
Duplicate detection
Cosine similarity implementation
Subject consistency
Mismatch rules
Retry limits
Idempotency
Review persistence
```

The general rule is:

> AI generates signals; application code decides whether those signals are safe to use.

---

## 24. Failure Philosophy

Failures should be visible and attributable.

The system therefore avoids:

- silently ignoring provider errors,
- silently accepting invalid JSON,
- silently converting uncertain classifications into trusted data,
- silently retrying forever,
- silently selecting unrelated images.

Instead it uses explicit states such as:

```text
pending
processed
review_required
queued
running
completed
failed
rejected
no_confident_match
```

---

## 25. Multi-Tenant Boundary

Major application entities are scoped through a tenant.

Candidate retrieval is performed only for images belonging to the post's tenant.

AI usage is also attributed to the tenant.

This prevents matching across unrelated tenant corpora and provides a basis for tenant-level budget accounting.

---

## 26. Explicit Non-Goals

The capstone does not attempt to build:

- a production-scale vector database,
- a billion-image search engine,
- a complex frontend,
- a full authentication and authorization product,
- payment or billing infrastructure,
- large-scale distributed worker orchestration,
- a general-purpose image recognition benchmark.

The goal is a small, reproducible backend AI system that demonstrates the engineering patterns required for reliable image understanding and content matching.

---

## 27. Clean-Machine Reproducibility

The project includes a local runner intended to make setup reproducible from a fresh database.

```bash
npm run capstone:run
```

The runner:

1. starts PostgreSQL,
2. waits for database health,
3. applies migrations,
4. starts the API,
5. starts the background image worker.

The demo corpus can then be created with:

```bash
npm run db:seed
```

A clean-machine acceptance run was also performed after removing the Docker volume with:

```bash
docker compose down -v
```

The system recreated the schema, seeded the demo tenant and corpus, completed a multi-image background job, persisted metadata and embeddings, returned the fox image as the accepted match for the fox post, and returned `no_confident_match` for the airplane post.

---

## 28. Future Extensions

The current architecture can later support:

- pgvector or a dedicated vector database,
- larger image corpora,
- richer taxonomy extraction,
- manual resolution of `review_required` images,
- automated embedding after human approval,
- configurable matching profiles,
- better linguistic subject extraction,
- larger evaluation datasets,
- threshold calibration from labeled data,
- worker concurrency controls,
- cloud object storage,
- authentication and tenant authorization,
- monitoring dashboards.

These are intentionally outside the core capstone scope.

---

## 29. Final Design Summary

The project is designed around a simple principle:

```text
AI understanding
        +
semantic retrieval
        +
deterministic validation
        +
explainable rejection
        +
human review
```

rather than:

```text
AI output
        ↓
blind recommendation
```

The architecture favors reliability, traceability, and explicit failure over always producing a result.
