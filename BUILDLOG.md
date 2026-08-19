# Build Log

This document records the implementation process, important engineering decisions,
experiments, failures, fixes, and AI-assisted development used while building the
FlyRank Image Relevance & Auto-Tagging capstone.

The project was developed incrementally. AI assistance was used as a development
partner for architecture discussions, implementation guidance, debugging, test
design, and documentation. All important behaviors were manually executed and
verified against the running application and PostgreSQL database.

---

## 2026-08-16 — Initial Architecture and Repository Setup

Created the initial capstone repository and defined the first architecture for an
AI-powered image understanding and content matching backend.

Initial design focused on:

- PostgreSQL persistence
- image ingestion
- structured vision metadata
- semantic embeddings
- post-to-image matching
- background processing
- human review
- AI usage tracking
- explicit rejection behavior

The first database schema included entities for:

```text
tenants
images
image_metadata
image_tags
image_embeddings
posts
post_embeddings
suggestions
reviews
ai_calls
background_jobs
```

Later migrations extended background processing with per-item state.

Docker Compose was used to run PostgreSQL locally.

Verified database initialization with:

```text
docker compose up -d
npm run db:migrate
```

The schema migration completed successfully and PostgreSQL contained the expected
application tables.

### AI assistance

AI assistance helped with:

- decomposing the capstone requirements into backend components
- designing repository/service boundaries
- planning the database entities
- defining reliability requirements before implementation

---

## 2026-08-16 — API Bootstrap and Tenant Persistence

Implemented the initial Express application and PostgreSQL connection.

Added:

```text
GET /health
```

The health endpoint confirms both API availability and PostgreSQL connectivity.

Created the initial demo tenant:

```text
FlyRank Demo
```

and made tenant creation idempotent so repeated seeding does not create duplicates.

Verified the tenant directly in PostgreSQL.

### Engineering decision

The system uses tenant-scoped data even though the capstone runs with a small demo
corpus.

This establishes a clean boundary for:

- image ownership
- post ownership
- recommendation isolation
- AI cost attribution
- budget tracking

---

## 2026-08-16 — Image Ingestion

Implemented image upload through:

```text
POST /images
```

The ingestion pipeline:

1. validates the image MIME type,
2. enforces the file size limit,
3. calculates a SHA-256 hash,
4. stores the uploaded file,
5. creates the image database record,
6. detects duplicate uploads.

Supported image formats include:

```text
JPEG
PNG
WebP
```

A red fox image was used for the first end-to-end upload test.

The persisted image initially entered:

```text
processing_status = pending
```

---

## 2026-08-16 — Express Router Integration Error

While adding the \`/images\` router, the application initially crashed with:

```text
TypeError: argument handler must be a function
```

The problem was caused by route code being placed incorrectly during integration.

The router mounting order and module exports were corrected.

After the fix:

```text
GET /health
```

worked again and:

```text
POST /images
```

successfully accepted image uploads.

### Lesson

Route registration errors can surface as framework-level handler errors rather than
obvious syntax errors.

Checking router exports and the exact \`app.use()\` arguments isolated the problem.

---

## 2026-08-16 — Portable Upload Paths

The first image records stored an absolute Windows path such as:

```text
C:/Users/.../flyrank-capstone-image-relevance/uploads/...
```

This would make persisted data machine-specific.

The ingestion service was changed to store repository-relative paths instead:

```text
uploads/\<uuid>.jpg
```

The database was cleaned and the image was uploaded again.

Verified result:

```text
file_path = uploads/...
```

### Engineering decision

Only portable relative paths are persisted.

Runtime code resolves them relative to the application directory when the actual file
must be read.

---

## 2026-08-16 — First Vision Integration Attempt

Integrated Gemini for image understanding.

The first configuration test failed because the model environment variable still
contained a placeholder:

```text
your_vision_model_here
```

The provider returned a model-not-found response.

This verified that configuration failures were visible rather than silently ignored.

The configuration was corrected to use the selected Gemini vision model.

---

## 2026-08-16 — First Successful Vision Analysis

Implemented structured vision analysis using Gemini.

The vision result is required to contain:

```json
{
  "subject": "...",
  "category": "...",
  "attributes": [],
  "caption": "...",
  "confidence": 0.0
}
```

The model response is parsed and validated using Zod before use.

The first real test correctly identified the uploaded image as:

```text
subject: red fox
category: animal
confidence: 0.98
```

Example caption:

```text
A red fox walks across a snow-covered landscape...
```

### AI assistance

AI assistance helped with:

- designing the structured metadata schema
- integrating image input with the vision API
- validating provider output with Zod
- designing failure handling around invalid provider responses

### Engineering decision

Raw model output is not trusted directly.

The application boundary is:

```text
AI response
    ↓
parse
    ↓
schema validation
    ↓
application data
```

---

## 2026-08-16 — Metadata and Automatic Tag Persistence

Added persistence for structured image metadata and automatically generated tags.

For the fox example, metadata included:

```text
subject: red fox
category: animal
confidence: 0.98
```

Generated tags included values such as:

```text
red fox
animal
reddish-orange fur
bushy tail
pointed ears
snow-covered ground
```

The image was then updated from:

```text
pending
```

to:

```text
processed
```

Database queries confirmed that metadata and tags were persisted correctly.

---

## 2026-08-16 — AI Usage, Latency, and Estimated Cost

Added AI-call persistence.

Each provider call records:

```text
operation
entity_type
entity_id
model
input_units
output_units
estimated_cost_usd
latency_ms
status
error_message
```

A successful vision call was recorded as:

```text
operation: vision_analysis
entity_type: image
status: success
```

The implementation also tracks provider token usage where available and calculates
an estimated list-price cost.

### Engineering decision

AI observability is treated as application data rather than temporary console output.

This makes cost and failure attribution inspectable after execution.

---

## 2026-08-16 — AI Budget Guard

Added tenant-level AI budget awareness.

Before expensive AI processing, tenant usage can be compared against the configured
budget.

The goal is not payment processing.

The purpose is to prevent an AI feature from behaving as if provider calls have no
operational cost.

---

## 2026-08-16 — PostgreSQL-Backed Background Processing

Moved image processing into durable background jobs.

Implemented:

```text
POST /jobs/image-processing
GET /jobs/:id
```

and a separate image worker:

```text
npm run worker:image
```

The API can now return a job reference immediately while the worker performs the
slow vision processing independently.

Observed worker execution:

```text
[worker] image processing worker started
[worker] processing job 1
[worker] image 3, attempt 1/3
[worker] image 3 completed
[worker] job 1 completed
```

The completed job exposed:

```text
status: completed
processed_items: 1
failed_items: 0
```

---

## 2026-08-16 — Background Batch Processing

Expanded the worker to process multiple image IDs inside one durable job.

Uploaded and processed three usable images:

```text
red fox
black wolf
black Labrador Retriever
```

The worker successfully processed the complete batch.

Database verification showed all three images with validated metadata and:

```text
processing_status = processed
```

### Engineering decision

Per-item state is stored separately from the parent job.

This allows a batch to report individual failures instead of collapsing all execution
information into one boolean result.

---

## 2026-08-16 — Idempotent Background Jobs

Added support for:

```text
Idempotency-Key
```

Repeated submission of the same logical background request returned the existing job
instead of creating duplicate work.

Observed behavior:

```text
duplicate: true
```

while PostgreSQL still contained a single job for the corresponding idempotency key.

### Why this matters

Without idempotency, client retries could cause:

- duplicate AI calls
- duplicate provider cost
- duplicate writes
- inconsistent job state

---

## 2026-08-16 — Retry and Permanent Failure Test

A controlled provider failure was introduced using an intentionally invalid model:

```text
invalid-test-model
```

The worker retried the image three times:

```text
attempt 1/3 → failed
attempt 2/3 → failed
attempt 3/3 → failed
```

Final persisted state:

```text
status: failed
attempt_count: 3
max_attempts: 3
failed_items: 1
```

The failed provider calls were also visible in \`ai_calls\`.

### Engineering decision

Retries are bounded.

The system must eventually expose a permanent failure instead of retrying forever.

---

## 2026-08-16 — Low-Confidence Vision Probe

Created an intentionally ambiguous image to test confidence handling.

The first direct vision call returned a confidence around:

```text
0.70
```

A later production-pipeline call persisted:

```text
confidence: 0.65
```

Configured threshold:

```text
0.75
```

Because:

```text
0.65 < 0.75
```

the application persisted:

```text
needs_review: true
processing_status: review_required
```

### Important observation

Live model confidence values can vary slightly between calls.

Therefore deterministic application behavior is based on threshold rules rather than
assuming the model will always return the same exact number.

---

## 2026-08-16 — Semantic Embeddings

Added semantic image embeddings using:

```text
gemini-embedding-001
```

Configured vector size:

```text
768
```

Generated embeddings for:

```text
image 3 → red fox
image 4 → black wolf
image 5 → black Labrador Retriever
```

Database verification:

```text
image_id | dimensions | vector_length
3        | 768        | 768
4        | 768        | 768
5        | 768        | 768
```

In the below-threshold acceptance probe, the ambiguous image was intentionally
rejected from automatic embedding:

```text
Image 6 requires review and cannot be embedded automatically.
```

In a later clean-machine run, the same image received confidence exactly `0.75`,
which is equal to the configured threshold. Because the policy rejects only values
below the threshold, that run allowed the image to continue through automatic
embedding.

### Engineering decision

Confidence policy, not a hard-coded image identity, controls whether an image becomes
trusted semantic search data. Below-threshold results are blocked; threshold-passing
results may proceed.

---

## 2026-08-16 — Post Embeddings and Semantic Ranking

Added blog-post persistence and semantic embeddings.

Created the test post:

```text
The Behavior of Red Foxes
```

The post embedding was compared against the image vectors using cosine similarity.

Observed ranking:

```text
1. red fox                  0.875515
2. black wolf               0.764005
3. black Labrador Retriever 0.705375
```

The correct image ranked first.

However, the wolf also received a relatively high score.

### Key discovery

Semantic similarity alone was not sufficient.

A wolf and a fox are semantically related enough that an embedding model can consider
them similar even though the wolf is incorrect for content explicitly about foxes.

This result directly motivated the mismatch guard.

---

## 2026-08-16 — Explainable Mismatch Guard

Implemented a deterministic post-ranking guard.

The guard considers:

```text
vision confidence
semantic similarity
explicit subject consistency
tag/content overlap
```

Configured base similarity threshold:

```text
0.72
```

For the fox post:

```text
red fox
similarity: 0.875515
decision: accepted
```

The wolf had:

```text
similarity: 0.764005
```

which is above the similarity threshold.

It was still rejected:

```text
decision: rejected
decision_code: subject_mismatch
```

with an explicit explanation:

```text
Subject mismatch: post explicitly targets "red fox",
but the image subject is "black wolf".
```

### Engineering decision

Retrieval and approval are separate concerns.

```text
embedding similarity → candidate retrieval
guard rules          → recommendation approval
```

A high similarity score cannot override a known subject contradiction.

---

## 2026-08-16 — Forced Candidate Evaluation

Added an endpoint allowing an individual candidate to be evaluated explicitly:

```text
GET /posts/:postId/images/:imageId/evaluate
```

The wolf was forced against the red-fox post.

Observed result:

```text
subject: black wolf
similarity: 0.764005
decision: rejected
decisionCode: subject_mismatch
```

This made mismatch behavior directly observable rather than only indirectly visible
inside ranked results.

---

## 2026-08-16 — No-Confident-Match Probe

Created an intentionally unrelated post:

```text
How Commercial Airplanes Generate Lift
```

The available corpus contained only:

```text
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

All were rejected.

Final result:

```text
status: no_confident_match
bestMatch: null
```

### Engineering decision

The highest ranked candidate is not automatically a valid recommendation.

No recommendation is a successful and intentional result when the corpus does not
contain a sufficiently relevant image.

---

## 2026-08-16 — Human Review Workflow

Implemented persisted human review.

A human can record:

```text
approved
rejected
```

against a suggestion.

The correct fox recommendation was manually approved.

The wolf recommendation was manually rejected.

PostgreSQL contained both review records and the review API returned both the latest
decision and review history.

### Separation of responsibilities

The system now preserves:

```text
automatic decision
```

separately from:

```text
human decision
```

This keeps machine reasoning and reviewer feedback independently auditable.

---

## 2026-08-16 — Automated Evaluation Harness

Created a small labeled evaluation corpus with four cases:

```text
red fox post    → red fox
black wolf post → black wolf
Labrador post   → black Labrador Retriever
airplane post   → no_confident_match
```

Implemented:

```text
npm run eval
```

The evaluation runner:

1. creates each post,
2. creates its embedding,
3. runs semantic ranking,
4. applies the guard,
5. compares the result to the expected label,
6. writes machine-readable results.

Observed result:

```text
Passed: 4/4
Overall accuracy: 100.00%
Top-1 accuracy: 100.00%
No-match accuracy: 100.00%
Average winning similarity: 0.867681
Guard rejections observed: 13
```

Detailed output is written to:

```text
docs/evaluation-results.json
```

### Important limitation

The evaluation contains only a small capstone corpus.

The result is therefore reported as:

```text
Top-1: 3/3 on the included evaluation corpus
```

rather than being presented as general model accuracy.

---

## 2026-08-17 — Deterministic Unit Tests

Added deterministic tests for core matching behavior.

The tests do not depend on live Gemini output.

Covered behavior includes:

```text
cosine similarity
identical vectors
orthogonal vectors
vector dimension mismatch
empty vectors
foxes → fox normalization
wolves → wolf normalization
correct subject acceptance
high-similarity subject mismatch rejection
low-confidence rejection
low-similarity rejection
```

Observed result:

```text
tests 10
pass 10
fail 0
cancelled 0
skipped 0
```

Run with:

```text
npm test
```

### Why both evals and tests exist

The project separates two types of verification.

#### Live evaluation

Tests the real AI pipeline:

```text
Gemini
embeddings
database
ranking
guard
```

#### Deterministic unit tests

Test the application rules without provider variability.

This prevents important reliability logic from becoming dependent on probabilistic
model behavior.

---

## 2026-08-17 — Integrated Vision + Embedding Worker

The image-processing worker was finalized so that one durable background item now
performs the complete per-image pipeline:

```text
claim job item
    ↓
vision analysis
    ↓
schema validation
    ↓
metadata and tags
    ↓
confidence policy
    ↓
image embedding when eligible
    ↓
persist completed / failed item state
```

Observed worker output included:

```text
[worker] image 1 vision processing completed
[worker] generating embedding for image 1
[worker] image 1 embedding completed
[worker] image 1 completed
```

The same sequence was observed for the remaining accepted images in the batch.

### Engineering decision

Vision metadata generation and semantic indexing belong to one observable background
pipeline, while still preserving persisted per-item progress and bounded retries.

---

## 2026-08-17 — Clean-Machine Reproduction

The repository was tested again from a fresh PostgreSQL volume rather than relying on
the existing development database.

Database reset:

```bash
docker compose down -v
```

A single runtime bootstrap command was added and verified:

```bash
npm run capstone:run
```

The command:

1. starts PostgreSQL,
2. waits for the database health check,
3. applies migrations,
4. starts the API,
5. starts the image worker.

Observed migration output from the clean database:

```text
[migration] applying: 001_initial_schema.sql
[migration] completed: 001_initial_schema.sql
[migration] applying: 002_background_job_items.sql
[migration] completed: 002_background_job_items.sql
[migration] all migrations completed
```

Observed runtime output:

```text
[worker] image processing worker started
[database] PostgreSQL connection established
[server] API running at http://localhost:3000
[server] Health check: http://localhost:3000/health
```

The demo corpus was then seeded with:

```bash
npm run db:seed
```

Fresh-database seed output created:

```text
demo tenant
ambiguous.jpg
dog_8.jpg
fox_55.jpg
wolf_1.jpg
The Behavior of Red Foxes
How Commercial Airplanes Generate Lift
```

A four-image batch was submitted through the normal background-job API.

Final job state:

```text
status: completed
total_items: 4
processed_items: 4
failed_items: 0
attempt_count: 1
```

The worker generated vision metadata and image embeddings during the same batch.

Persisted embedding verification:

```text
ambiguous.jpg | gemini-embedding-001 | 768
dog_8.jpg     | gemini-embedding-001 | 768
fox_55.jpg    | gemini-embedding-001 | 768
wolf_1.jpg    | gemini-embedding-001 | 768
```

The ambiguous image produced confidence exactly:

```text
0.75
```

in this clean-machine run. Because the configured rule treats only values below
`0.75` as review-required, this particular run allowed the image to proceed. Earlier
calls that returned `0.65` still verified the below-threshold review path.

### Result

```text
Fresh database bootstrap: PASS
Versioned migrations from zero state: PASS
API startup: PASS
Worker startup: PASS
Four-image background batch: PASS
Integrated vision + embedding processing: PASS
```

---

## 2026-08-17 — Final Matching Verification

The final matching behavior was rechecked after the clean-machine processing run.

For:

```text
The Behavior of Red Foxes
```

the API returned:

```text
status: matched
best image: fox_55.jpg
subject: red fox
decision: accepted
```

Other candidates were rejected with explicit reasons such as:

```text
subject_mismatch
low_similarity
```

For:

```text
How Commercial Airplanes Generate Lift
```

the API returned:

```text
status: no_confident_match
bestMatch: null
```

This confirmed that the final pipeline still follows the core design principle:

```text
A wrong recommendation is worse than no recommendation.
```

---

## 2026-08-17 — Final Evaluation Re-Run

The labeled evaluation was executed again after the final worker and matching
verification.

Command:

```bash
npm run eval
```

Observed result:

```text
red-fox-positive       PASS
black-wolf-positive    PASS
labrador-positive      PASS
airplane-negative      PASS

Passed: 4/4
Overall accuracy: 100.00%
Top-1 accuracy: 100.00%
No-match accuracy: 100.00%
Average winning similarity: 0.867681
Guard rejections observed: 13
```

The machine-readable report was regenerated at:

```text
docs/evaluation-results.json
```

This remains a small capstone evaluation corpus and is not presented as general model
accuracy.

---

## Major Iterations and Lessons

### 1. Raw AI output must have a contract

The model is useful for perception, but application code must define what output is
acceptable.

Zod validation became the boundary between probabilistic generation and trusted
application data.

### 2. Confidence should affect downstream behavior

A low-confidence result is not just a number to log.

It changes application state and prevents automatic indexing.

### 3. Semantic similarity is retrieval, not truth

The fox/wolf experiment demonstrated this clearly:

```text
fox  → 0.875515
wolf → 0.764005
```

Both were semantically relevant, but only one was correct.

### 4. No-match must be supported explicitly

A recommendation engine that always returns something will eventually recommend
something clearly wrong.

### 5. Slow AI calls should not control HTTP request lifetime

Background workers make retries, progress, failure, and idempotency much easier to
reason about.

### 6. AI cost is part of backend engineering

Provider calls are attributed to operations and tenants rather than treated as an
invisible external side effect.

### 7. Live AI tests and deterministic tests solve different problems

Provider-backed evaluation verifies integration quality.

Unit tests verify that application safety rules remain stable.

---

## AI-Assisted Development Disclosure

AI assistance was used throughout development for:

- requirement decomposition
- architecture discussion
- schema design
- API design
- implementation scaffolding
- debugging
- PostgreSQL query construction
- background-job design
- retry and idempotency logic
- Gemini integration
- embedding integration
- mismatch-guard design
- evaluation design
- unit-test generation
- documentation review

AI-generated suggestions were not treated as automatically correct.

Changes were iteratively implemented and verified through:

- real HTTP requests
- live Gemini calls
- worker logs
- PostgreSQL queries
- controlled failure injection
- deterministic tests
- automated evaluation

Several initial implementations required correction during development, including:

```text
Express route mounting
portable image paths
vision model configuration
confidence handling
matching thresholds
```

These iterations are intentionally documented because they reflect the actual
engineering process rather than presenting the project as if it worked perfectly on
the first attempt.

---

## Final Build State

At the end of the capstone implementation, the system demonstrated:

```text
Image ingestion                         PASS
SHA-256 duplicate detection             PASS
Structured vision metadata              PASS
Schema validation                       PASS
Low-confidence review handling          PASS
Metadata/tag persistence                PASS
Background processing                   PASS
Batch processing                        PASS
Idempotency                             PASS
Retries and permanent failure           PASS
AI cost and latency attribution         PASS
Tenant budget awareness                 PASS
Image embeddings                        PASS
Post embeddings                         PASS
Cosine similarity ranking               PASS
Fox > wolf > dog ranking                PASS
Explainable subject mismatch rejection  PASS
Forced wolf rejection                   PASS
No-confident-match behavior             PASS
Human review persistence                PASS
Automated evaluation                    4/4 PASS
Deterministic unit tests                10/10 PASS
Clean-machine database bootstrap        PASS
Integrated vision + embedding worker    PASS
Single-command runtime bootstrap        PASS
Final positive matching verification    PASS
Final no-confident-match verification   PASS
```

The implementation and reproducibility checks are complete. Final repository cleanup,
documentation review, and submission packaging remain as release tasks rather than
core feature work.