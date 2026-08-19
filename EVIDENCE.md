# Evidence

This document contains reproducible evidence for the main behaviors implemented in
the FlyRank Image Relevance & Auto-Tagging capstone.

The goal is to make the critical acceptance behaviors easy to inspect without
requiring reviewers to infer them from source code alone.

---

# 1. Foundation

## 1.1 Database Migrations

The PostgreSQL schema is managed through versioned migrations.

First execution:

```text
[migration] applying: 001_initial_schema.sql
[migration] completed: 001_initial_schema.sql
[migration] applying: 002_background_job_items.sql
[migration] completed: 002_background_job_items.sql
[migration] all migrations completed
```

Repeated execution:

```text
[migration] already applied: 001_initial_schema.sql
[migration] already applied: 002_background_job_items.sql
[migration] all migrations completed
```

This demonstrates that schema initialization is repeatable and does not reapply an
already-recorded migration.

---

## 1.2 Database Persistence

The database persists the main application entities:

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
background_job_items
schema_migrations
```

---

## 1.3 Seed Idempotency

First execution:

```text
[seed] demo tenant created
```

Second execution:

```text
[seed] demo tenant already exists
```

Repeated seeding therefore reuses the existing demo tenant rather than creating
duplicates.

---

## 1.4 API Health Check

Request:

```http
GET /health
```

Observed response:

```json
{
  "status": "ok",
  "service": "image-relevance-api",
  "database": {
    "status": "connected",
    "name": "image_relevance"
  }
}
```

---

## 1.5 Unknown Endpoint Handling

Request:

```http
GET /test
```

Observed response:

```json
{
  "error": "not_found",
  "message": "The requested endpoint does not exist."
}
```

---

# 2. Image Understanding

## 2.1 Structured Vision Output

Test image:

```text
fox_55.jpg
```

A real image was processed with Gemini and the provider response was parsed and
validated against the application Zod schema before persistence.

Validated output:

```json
{
  "subject": "red fox",
  "category": "animal",
  "attributes": [
    "reddish-orange fur",
    "black lower legs",
    "bushy tail",
    "white chest and muzzle",
    "pointed ears",
    "snowy ground"
  ],
  "caption": "A red fox walks across a snow-covered ground in bright sunlight with a dark woodland background.",
  "confidence": 0.98
}
```

Observed direct-test latency:

```text
6278 ms
```

### Result

```text
Structured output: PASS
Schema validation: PASS
```

---

## 2.2 Low-Confidence Classification Handling

An intentionally ambiguous image was used to test uncertainty handling.

A direct vision test returned:

```json
{
  "subject": "line drawing of an animal head",
  "category": "animal",
  "attributes": [
    "black and white",
    "line art",
    "minimalist",
    "pointed ears",
    "ambiguous figure"
  ],
  "confidence": 0.70
}
```

A later execution through the production background-processing path returned and
persisted:

```text
confidence: 0.65
needs_review: true
processing_status: review_required
```

Configured threshold:

```text
VISION_CONFIDENCE_THRESHOLD=0.75
```

Production decision:

```text
0.65 < 0.75
```

Therefore:

```text
needs_review = true
processing_status = review_required
```

### Result

```text
Low-confidence output silently accepted: NO
Human review flag created: YES
Automatic downstream trust prevented: YES
```

Live model confidence varied between calls, but the application threshold behavior
remained deterministic. In the final clean-machine run, the same ambiguous image
returned exactly `0.75`, which is equal to the configured threshold, so it was
processed rather than flagged. The earlier `0.65` run remains the acceptance probe
for the below-threshold review path.

---

## 2.3 Metadata and Tags

Processed images were persisted with structured metadata and normalized tags.

Example fox metadata:

```text
subject: red fox
category: animal
confidence: 0.98
processing_status: processed
```

Example tags:

```text
animal
black lower legs
bushy tail
pointed ears
red fox
reddish-orange fur
snow-covered ground
white chest and chin
```

---

# 3. AI Usage and Cost Evidence

A successful vision-analysis call was attributed to the processed image and stored in
PostgreSQL.

Observed record:

```yaml
operation: vision_analysis
entity_type: image
entity_id: 3
model: gemini-3.6-flash
input_units: 1214
output_units: 510
estimated_cost_usd: 0.00282300
latency_ms: 4632
status: success
```

Tenant-level aggregation:

```yaml
tenant_id: 1
calls: 1
estimated_cost: 0.00282300
```

The application also checks tenant AI budget state before expensive model execution.

### Result

```text
AI call attribution: PASS
Latency tracking: PASS
Estimated cost tracking: PASS
Tenant aggregation: PASS
```

---

# 4. Background Processing

## 4.1 Asynchronous Image Processing

Image analysis runs through a PostgreSQL-backed background job.

Request:

```http
POST /jobs/image-processing
```

The HTTP request returned a job reference while processing continued in a separate
worker.

Observed worker output:

```text
[worker] image processing worker started
[worker] processing job 1
[worker] image 3, attempt 1/3
[worker] image 3 completed
[worker] job 1 completed
```

Final job state:

```text
status: completed
total_items: 1
processed_items: 1
failed_items: 0
attempt_count: 1
```

### Result

```text
Durable background processing: PASS
HTTP request decoupled from AI work: PASS
Progress persisted: PASS
```

---

## 4.2 Multi-Image Batch Processing

A single background job processed three images:

```text
fox_55.jpg
wolf_1.jpg
dog_8.jpg
```

Observed worker execution:

```text
[worker] processing job 2
[worker] image 3, attempt 1/3
[worker] image 3 completed
[worker] image 4, attempt 1/3
[worker] image 4 completed
[worker] image 5, attempt 1/3
[worker] image 5 completed
[worker] job 2 completed
```

Persisted metadata:

```text
fox_55.jpg | red fox                   | animal | 0.98 | processed
wolf_1.jpg | black wolf                | animal | 0.95 | processed
dog_8.jpg  | black Labrador Retriever  | animal | 0.98 | processed
```

### Result

```text
Multi-image batch processing: PASS
Per-image metadata persistence: PASS
```

---

## 4.3 Idempotency

The same batch request was submitted again with the same:

```text
Idempotency-Key
```

Observed API response:

```text
job_id: 1
status: completed
duplicate: True
```

Persisted database record:

```text
id: 1
job_type: image_processing
status: completed
idempotency_key: image-processing:1:fox-batch-001
total_items: 1
processed_items: 1
```

Only one background job existed for that idempotency key.

### Result

```text
Duplicate job creation prevented: PASS
Repeated request safely reused work: PASS
```

---

## 4.4 Retry and Permanent Failure Handling

A controlled provider failure was introduced using:

```text
invalid-test-model
```

Observed retries:

```text
[worker] image 4, attempt 1/3
[worker] image 4 failed: 404 Model 'invalid-test-model' not found
[worker] job 3 will retry

[worker] image 4, attempt 2/3
[worker] image 4 failed: 404 Model 'invalid-test-model' not found
[worker] job 3 will retry

[worker] image 4, attempt 3/3
[worker] image 4 failed: 404 Model 'invalid-test-model' not found
```

Final job state:

```text
status: failed
attempt_count: 3
max_attempts: 3
failed_items: 1
```

Final item state:

```text
status: failed
attempt_count: 3
max_attempts: 3
```

Failed provider calls were also persisted in `ai_calls`:

```text
model: invalid-test-model
status: failed
error_message: provider 404
```

### Result

```text
Retry behavior: PASS
Retry limit enforced: PASS
Permanent failure surfaced: PASS
Failed AI call logged: PASS
```

---

# 5. Semantic Embeddings

## 5.1 Image Embeddings

Validated image metadata was embedded with:

```text
gemini-embedding-001
```

Persisted vectors:

```text
image_id | model                 | dimensions | vector_length
\---------+-----------------------+------------+--------------
3        | gemini-embedding-001  | 768        | 768
4        | gemini-embedding-001  | 768        | 768
5        | gemini-embedding-001  | 768        | 768
```

In the below-threshold acceptance probe, the ambiguous image was excluded:

```text
Image 6 requires review and cannot be embedded automatically.
```

In the final clean-machine run, the same image received confidence `0.75`, which is
equal to the configured threshold, so it became eligible for embedding. That run
persisted four `768`-dimensional image vectors. The invariant is that only images
accepted by the confidence policy proceed to automatic embedding.

### Result

```text
Image embedding generation: PASS
Expected vector dimensionality: PASS
Below-threshold image exclusion: PASS
Confidence-gated embedding behavior: PASS
```

---

## 5.2 Semantic Image Ranking

Post:

```text
The Behavior of Red Foxes
```

Observed cosine similarity ranking:

```text
rank | subject                   | similarity
\-----+---------------------------+-----------
1    | red fox                   | 0.875515
2    | black wolf                | 0.764005
3    | black Labrador Retriever  | 0.705375
```

### Acceptance Probe

Expected:

```text
fox > wolf > dog
```

Observed:

```text
fox > wolf > dog
```

### Result

```text
Semantic ranking probe: PASS
Top-ranked subject: red fox
```

The wolf's relatively high score also demonstrates why similarity alone is not used
as the final recommendation rule.

---

# 6. Explainable Mismatch Guard

## 6.1 Correct Fox Candidate

Candidate:

```text
subject: red fox
similarity: 0.875515
```

Observed result:

```text
decision: accepted
decision_code: accepted
```

---

## 6.2 Forced Wolf Candidate

Candidate:

```text
subject: black wolf
similarity: 0.764005
```

Configured base similarity threshold:

```text
0.72
```

Therefore:

```text
0.764005 > 0.72
```

Despite passing the similarity threshold, the candidate was rejected:

```text
decision: rejected
decision_code: subject_mismatch
```

Reason:

```text
Subject mismatch: post explicitly targets "red fox",
but the image subject is "black wolf".
```

The same behavior was reproduced directly using:

```http
GET /posts/1/images/4/evaluate
```

### Acceptance Probe

Expected:

```text
forced wolf for fox post → rejected with explanation
```

Observed:

```text
forced wolf → rejected / subject_mismatch
```

### Result

```text
Mismatch guard probe: PASS
Explainable reason returned: PASS
Similarity prevented from overriding contradiction: PASS
```

---

# 7. No-Confident-Match Behavior

Unrelated post:

```text
How Commercial Airplanes Generate Lift
```

Available image corpus:

```text
red fox
black wolf
black Labrador Retriever
```

Observed result:

```text
status: no_confident_match
bestMatch: null
```

Candidate scores:

```text
black wolf                0.656699 → rejected
red fox                   0.656260 → rejected
black Labrador Retriever  0.644928 → rejected
```

Configured threshold:

```text
0.72
```

All candidates were below the threshold.

### Acceptance Probe

Expected:

```text
unrelated airplane post → no_confident_match
```

Observed:

```text
status: no_confident_match
bestMatch: null
```

### Result

```text
No-confident-match probe: PASS
Least-bad unrelated image returned: NO
```

---

# 8. Human Review Workflow

## 8.1 Correct Recommendation Approval

Suggestion:

```text
suggestion_id: 1
image_id: 3
subject: red fox
automatic_decision: accepted
similarity: 0.875515
```

Human review:

```text
action: approved
```

Reviewer note:

```text
Correct match. The post is specifically about red foxes and the selected
image clearly depicts a red fox.
```

---

## 8.2 Incorrect Candidate Rejection

Suggestion:

```text
suggestion_id: 2
image_id: 4
subject: black wolf
automatic_decision: rejected
similarity: 0.764005
```

Human review:

```text
action: rejected
```

Reviewer note:

```text
The image depicts a wolf, while the post explicitly discusses red foxes.
```

Both reviews were persisted in PostgreSQL.

The review API also returned:

```text
suggestion
latestReview
reviews
```

### Result

```text
Human approve workflow: PASS
Human reject workflow: PASS
Review persistence: PASS
Review history retrieval: PASS
```

---

# 9. Automated Evaluation

Evaluation corpus:

```text
red fox post     → expected: red fox
black wolf post  → expected: black wolf
Labrador post    → expected: black Labrador Retriever
airplane post    → expected: no_confident_match
```

Command:

```bash
npm run eval
```

Observed result:

```text
Passed: 4/4
Overall accuracy: 100.00%

Top-1 accuracy:
3/3
100.00%

No-match accuracy:
1/1
100.00%

Average winning similarity:
0.867681

Guard rejections observed:
13
```

Machine-readable results:

```text
docs/evaluation-results.json
```

## 9.1 Final Evaluation Run

The evaluation suite was executed again after the final matching and mismatch-guard
changes.

Command:

```bash
npm run eval
```

Observed final run:

```text
[eval] red-fox-positive
[eval] expected: red fox
[eval] actual: red fox
[eval] PASS

[eval] black-wolf-positive
[eval] expected: black wolf
[eval] actual: black wolf
[eval] PASS

[eval] labrador-positive
[eval] expected: black Labrador Retriever
[eval] actual: black Labrador Retriever
[eval] PASS

[eval] airplane-negative
[eval] expected: no_confident_match
[eval] actual: no_confident_match
[eval] PASS
```

Final evaluation summary:

```text
Passed: 4/4
Overall accuracy: 100.00%
Top-1 accuracy: 100.00%
No-match accuracy: 100.00%
Average winning similarity: 0.867681
Guard rejections observed: 13
```

The machine-readable report was written to:

```text
docs/evaluation-results.json
```

This verifies both positive and negative behavior: relevant posts receive the expected
top-ranked image, while unrelated content is allowed to return
`no_confident_match` instead of forcing a weak recommendation.

---

## 9.2 Final Matching Verification

The final API behavior was verified against the reproducible demo corpus.

For the post:

```text
The Behavior of Red Foxes
```

the matching endpoint returned:

```text
status: matched
best image: fox_55.jpg
subject: red fox
decision: accepted
```

The fox candidate passed the subject-consistency, vision-confidence, and
semantic-similarity checks.

Other animal candidates were rejected with explicit decision codes such as:

```text
subject_mismatch
low_similarity
```

For the unrelated post:

```text
How Commercial Airplanes Generate Lift
```

the matching endpoint returned:

```text
status: no_confident_match
bestMatch: null
```

This verifies the project's central safety principle:

> A wrong recommendation is worse than no recommendation.

---

### Important Scope Note

This is a small capstone evaluation corpus.

The result should therefore be interpreted as:

```text
Top-1 accuracy: 3/3 on the included capstone evaluation corpus.
```

It is not claimed as general model accuracy.

### Result

```text
Automated evaluation: PASS
Positive Top-1 cases: 3/3
Negative no-match cases: 1/1
```

---

# 10. Deterministic Unit Tests

Command:

```bash
npm test
```

Coverage includes:

```text
cosine similarity correctness
vector dimension validation
empty-vector rejection
plural subject normalization
correct subject acceptance
explicit subject mismatch rejection
low-confidence rejection
low-similarity rejection
```

Observed result:

```text
tests: 10
pass: 10
fail: 0
cancelled: 0
skipped: 0
```

### Result

```text
Deterministic test suite: PASS
10/10 tests passed
```

---

# 11. Acceptance Summary

| Capability | Evidence | Result |
|---|---|---|
| PostgreSQL persistence | schema + direct queries | PASS |
| Repeatable migrations | second migration run skipped applied migration | PASS |
| Seed idempotency | existing tenant reused | PASS |
| API health | `/health` | PASS |
| Structured vision output | real fox image + Zod validation | PASS |
| Low-confidence handling | ambiguous image → `review_required` | PASS |
| AI cost attribution | `ai_calls` record + tenant aggregation | PASS |
| Background processing | API + separate worker | PASS |
| Batch processing | fox/wolf/dog in one job | PASS |
| Idempotency | duplicate request reused one job | PASS |
| Retry behavior | 3 controlled failed attempts | PASS |
| Permanent failure | failed job persisted | PASS |
| Image embeddings | eligible images persisted as 768-dimensional vectors | PASS |
| Low-confidence embedding guard | below-threshold review-required image blocked | PASS |
| Semantic ranking | fox > wolf > dog | PASS |
| Mismatch guard | wolf rejected despite 0.764005 similarity | PASS |
| Explainable rejection | `subject_mismatch` reason returned | PASS |
| No-confident-match | airplane post returned no recommendation | PASS |
| Human approve/reject | persisted review records | PASS |
| Automated evaluation | 4/4 included cases; 100% Top-1 and no-match accuracy on the capstone corpus | PASS |
| Deterministic unit tests | 10/10 | PASS |

---

# 12. Reproduction Commands

Start PostgreSQL:

```bash
docker compose up -d
```

Apply migrations:

```bash
npm run db:migrate
```

Seed demo data:

```bash
npm run db:seed
```

Start API:

```bash
npm run dev
```

Start worker in a separate terminal:

```bash
npm run worker:image
```

Run deterministic tests:

```bash
npm test
```

Run the labeled evaluation:

```bash
npm run eval
```

Detailed evaluation evidence is generated at:

```text
docs/evaluation-results.json
```

---

# 13. Clean-Machine Reproduction

The project was also verified from a fresh PostgreSQL volume.

Database reset:

```bash
docker compose down -v
```

Single-command runtime bootstrap:

```bash
npm run capstone:run
```

Observed startup behavior:

```text
Container image-relevance-db Healthy
[migration] applying: 001_initial_schema.sql
[migration] completed: 001_initial_schema.sql
[migration] applying: 002_background_job_items.sql
[migration] completed: 002_background_job_items.sql
[migration] all migrations completed
[worker] image processing worker started
[database] PostgreSQL connection established
[server] API running at http://localhost:3000
[server] Health check: http://localhost:3000/health
```

The demo seed was then executed:

```bash
npm run db:seed
```

Observed first-run seed result:

```text
demo tenant created
ambiguous.jpg created
dog_8.jpg created
fox_55.jpg created
wolf_1.jpg created
The Behavior of Red Foxes created
How Commercial Airplanes Generate Lift created
```

A four-image background batch was submitted and completed:

```text
job_type: image_processing
status: completed
total_items: 4
processed_items: 4
failed_items: 0
attempt_count: 1
```

The worker performed both vision analysis and embedding generation for each image in
the accepted batch:

```text
vision processing completed
generating embedding
embedding completed
image completed
```

Persisted embeddings in the final clean-machine run:

```text
ambiguous.jpg | gemini-embedding-001 | 768
dog_8.jpg     | gemini-embedding-001 | 768
fox_55.jpg    | gemini-embedding-001 | 768
wolf_1.jpg    | gemini-embedding-001 | 768
```

Final matching checks still preserved the intended safety behavior:

```text
The Behavior of Red Foxes
→ matched
→ fox_55.jpg
→ red fox
→ accepted
```

and:

```text
How Commercial Airplanes Generate Lift
→ no_confident_match
→ bestMatch: null
```

### Result

```text
Fresh database bootstrap: PASS
Versioned migrations from zero state: PASS
API + worker startup: PASS
Four-image background batch: PASS
Vision + embedding pipeline: PASS
Positive matching behavior: PASS
Negative no-confident-match behavior: PASS
```

---

# Final Evidence State

The project has demonstrated the full intended backend AI flow:

```text
Image ingestion
      ↓
Durable background processing
      ↓
Structured vision analysis
      ↓
Schema validation
      ↓
Confidence handling
      ↓
Metadata and tags
      ↓
Semantic embeddings
      ↓
Post/image similarity ranking
      ↓
Explainable mismatch guard
      ↓
Accepted / rejected / no_confident_match
      ↓
Human review
      ↓
Reproducible evaluation
```

The implementation favors explicit failure, traceability, and explainable rejection
instead of always forcing a recommendation.