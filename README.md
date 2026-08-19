# FlyRank Capstone — AI Image Understanding & Content Matching Engine

A backend AI system that understands image libraries, generates structured metadata, creates semantic embeddings, matches images to written content, rejects unreliable recommendations, and supports human review.

The project was built for the FlyRank Backend AI Engineering Capstone: **Image Relevance & Auto-Tagging**.

---

## Status

**Capstone implementation complete, clean-machine verified, and evaluated.**

Implemented capabilities:

- Image upload and persistence
- SHA-256 duplicate detection
- Structured image understanding with Gemini
- Schema validation with Zod
- Automatic image tagging
- Low-confidence review flagging
- PostgreSQL-backed background processing
- Retry and permanent failure handling
- Idempotent batch jobs
- AI token, latency, and estimated cost tracking
- Tenant AI budget guard
- Image embeddings
- Post embeddings
- Cosine similarity ranking
- Explainable mismatch guard
- Explicit `no_confident_match` behavior
- Human approve/reject review workflow
- Automated evaluation harness
- Deterministic unit tests

---

## System Overview

The application follows this pipeline:

```text
Image Upload
    ↓
SHA-256 Deduplication
    ↓
Background Processing Job
    ↓
Gemini Vision Analysis
    ↓
Zod Schema Validation
    ↓
Confidence Guard
    ↓
Metadata + Tags
    ↓
Image Embedding
    ↓

Blog Post
    ↓
Post Embedding
    ↓

Cosine Similarity Ranking
    ↓
Mismatch Guard
    ↓
Accepted / Rejected / No Confident Match
    ↓
Human Review
```

The system intentionally does not trust similarity scores or raw model output by themselves.

A recommendation must pass multiple checks before being accepted.

---

## Technology Stack

- Node.js
- Express
- PostgreSQL
- Docker Compose
- Gemini API
- `gemini-3.6-flash` for image understanding
- `gemini-embedding-001` for semantic embeddings
- Zod for structured output validation
- Multer for image uploads
- Native Node.js test runner

---

## Core AI Pipeline

### 1. Image Ingestion

Images are uploaded through the API and persisted locally.

During ingestion the system:

- validates supported image types
- enforces upload size limits
- calculates SHA-256 hashes
- detects duplicate uploads
- stores image metadata in PostgreSQL
- assigns an initial processing status

Supported formats include:

```text
JPEG
PNG
WebP
```

---

### 2. Structured Image Understanding

Images are analyzed with Gemini Vision.

The model is instructed to produce structured metadata containing:

```json
{
  "subject": "red fox",
  "category": "animal",
  "attributes": [
    "reddish-orange fur",
    "bushy tail",
    "pointed ears"
  ],
  "caption": "A red fox walks across a snow-covered landscape.",
  "confidence": 0.98
}
```

The application does not directly trust raw model output.

Responses are parsed and validated using Zod before they can be persisted.

---

### 3. Low-Confidence Handling

A confidence threshold prevents uncertain classifications from silently entering the recommendation system.

Default threshold:

```text
0.75
```

In a controlled low-confidence test, an ambiguous image produced:

```text
confidence: 0.65
needs_review: true
processing_status: review_required
```

Images marked `review_required` are excluded from automatic embedding and matching.

---

## Background Image Processing

Image analysis is executed through PostgreSQL-backed background jobs instead of blocking the upload request.

A client creates a job and receives a job identifier immediately.

The separate worker then processes the image batch.

Example worker flow:

```text
[worker] image processing worker started
[worker] processing job 2
[worker] image 3, attempt 1/3
[worker] image 3 completed
[worker] image 4, attempt 1/3
[worker] image 4 completed
[worker] image 5, attempt 1/3
[worker] image 5 completed
[worker] job 2 completed
```

Jobs persist:

- status
- total items
- processed items
- failed items
- attempt count
- maximum attempts
- timestamps
- error information

---

## Retry and Failure Handling

Background items are retried up to three times.

A controlled failure test using an invalid vision model demonstrated:

```text
attempt 1/3 → failed
attempt 2/3 → failed
attempt 3/3 → failed
```

Final state:

```text
status: failed
attempt_count: 3
max_attempts: 3
failed_items: 1
```

Failed AI calls are also persisted in the AI usage log.

---

## Idempotency

Background batch creation supports the `Idempotency-Key` HTTP header.

Submitting the same request multiple times with the same key does not create duplicate work.

Observed test:

```text
job_id: 1
status: completed
duplicate: true
```

The database still contained exactly one background job for the idempotency key.

---

## Semantic Embeddings

Validated image metadata is converted into semantic text and embedded using:

```text
gemini-embedding-001
```

Embedding dimensionality:

```text
768
```

A clean-machine run persisted 768-dimensional image embeddings for all automatically trusted images.

Low-confidence images with `confidence < 0.75` are not automatically embedded. An image at the configured threshold is eligible because the rejection rule is strictly below the threshold.

---

## Post Embeddings

Blog posts are also converted into semantic embeddings using the same embedding model.

Example post:

```text
Title:
The Behavior of Red Foxes

Content:
Red foxes are intelligent wild canids known for their reddish-orange fur,
bushy tails, pointed ears, and adaptable behavior in woodland and snowy
environments.
```

The post embedding is compared against eligible image embeddings using cosine similarity.

---

## Semantic Ranking

For the red fox post, the latest clean-machine run produced:

```text
rank | subject                             | similarity | decision
-----+-------------------------------------+------------+-------------------
1    | red fox                             | 0.872638   | accepted
2    | black wolf                          | 0.770752   | subject_mismatch
3    | black and white line drawing        | 0.719947   | low_similarity
4    | black Labrador Retriever            | 0.714552   | subject_mismatch
```

The correct fox image ranked first.

However, the wolf still received a relatively high semantic score.

This is why the application does not rely on cosine similarity alone.

---

## Explainable Mismatch Guard

The mismatch guard combines:

- semantic similarity
- vision confidence
- explicit subject consistency
- tag/content overlap

Default semantic threshold:

```text
0.72
```

For the red fox post, the latest clean-machine run produced:

```text
red fox
similarity: 0.872638
decision: accepted
```

The wolf produced:

```text
black wolf
similarity: 0.770752
decision: rejected
decision_code: subject_mismatch
```

Even though the wolf was above the semantic threshold, it was rejected because the post explicitly requested a fox.

Example reason:

```text
Subject mismatch: post explicitly targets "red fox",
but the image subject is "black wolf".
```

This demonstrates why similarity alone is not sufficient for safe recommendation.

---

## No-Confident-Match Behavior

The engine can explicitly return no recommendation.

A test post about commercial airplane aerodynamics was evaluated against the clean demo corpus containing fox, wolf, dog, and an ambiguous animal drawing.

Observed result:

```json
{
  "status": "no_confident_match",
  "bestMatch": null
}
```

Candidate similarities:

```text
black wolf               0.656699 → rejected
red fox                  0.656260 → rejected
black Labrador Retriever 0.644928 → rejected
```

Instead of returning the least-bad image, the system correctly returned no match.

---

## Human Review Workflow

Automatic recommendations can be manually approved or rejected.

Example approved recommendation:

```text
suggestion_id: 1
image: red fox
automatic_decision: accepted
human_action: approved
```

Example rejected recommendation:

```text
suggestion_id: 2
image: black wolf
automatic_decision: rejected
human_action: rejected
```

Review decisions and notes are stored in PostgreSQL and remain available as review history.

---

## AI Usage and Cost Tracking

AI calls are recorded with operational metadata including:

- tenant
- operation
- entity type
- entity ID
- provider
- model
- input units
- output units
- estimated cost
- latency
- status
- error message

Operations include:

```text
vision_analysis
image_embedding
post_embedding
```

The system also supports a per-tenant AI budget guard.

This prevents unrestricted AI usage from silently exceeding the configured budget.

---

## Automated Evaluation

The repository includes a small labeled evaluation corpus.

Cases:

```text
red fox post    → red fox
black wolf post → black wolf
Labrador post   → black Labrador Retriever
airplane post   → no_confident_match
```

Latest observed evaluation result:

```text
Passed: 4/4

Overall accuracy:
100.00%

Top-1:
3/3 correct
100.00%

No-match:
1/1 correct
100.00%

Average winning similarity:
0.867681

Guard rejections observed:
13
```

Detailed results are stored in:

```text
docs/evaluation-results.json
```

These metrics describe only the included capstone evaluation corpus and should not be interpreted as general model benchmark accuracy.

Run the evaluation with:

```bash
npm run eval
```

---

## Deterministic Unit Tests

Core matching rules also have deterministic unit tests that do not require live AI calls.

Tests cover:

- cosine similarity
- identical vectors
- orthogonal vectors
- dimension mismatch handling
- empty-vector handling
- singular/plural subject normalization
- correct subject acceptance
- subject mismatch rejection
- low-confidence rejection
- low-similarity rejection

Current result:

```text
tests: 10
pass: 10
fail: 0
```

Run:

```bash
npm test
```

---

## API Endpoints

### Health

```http
GET /health
```

Returns API and database health information.

---

### Images

Upload an image:

```http
POST /images
Content-Type: multipart/form-data
```

Fields:

```text
tenant_id
image
```

Retrieve an image record:

```http
GET /images/:id
```

---

### Background Image Jobs

Create a processing job:

```http
POST /jobs/image-processing
```

Example body:

```json
{
  "tenant_id": 1,
  "image_ids": [3, 4, 5]
}
```

Optional header:

```text
Idempotency-Key: fox-wolf-dog-batch-001
```

Retrieve job state:

```http
GET /jobs/:id
```

---

### Posts

Create and embed a post:

```http
POST /posts
```

Example:

```json
{
  "tenant_id": 1,
  "title": "The Behavior of Red Foxes",
  "body": "Red foxes are intelligent wild canids..."
}
```

Retrieve a post:

```http
GET /posts/:id
```

Rank available images:

```http
GET /posts/:id/images
```

Force evaluation of a specific image candidate:

```http
GET /posts/:postId/images/:imageId/evaluate
```

This endpoint is useful for demonstrating mismatch-guard behavior.

---

### Reviews

Create a human review:

```http
POST /reviews/suggestions/:suggestionId
```

Example:

```json
{
  "action": "approved",
  "notes": "Correct match."
}
```

Supported actions:

```text
approved
rejected
```

Retrieve review history:

```http
GET /reviews/suggestions/:suggestionId
```

Retrieve the latest review:

```http
GET /reviews/suggestions/:suggestionId/latest
```

---

## Database Model

Main PostgreSQL tables include:

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

## Project Structure

```text
.
├── docs/
│   └── evaluation-results.json
│
├── scripts/
│   ├── embedImage.js
│   ├── migrate.js
│   ├── processImage.js
│   ├── runEvaluation.js
│   ├── seed.js
│   └── testVision.js
│
├── sql/
│   └── migrations/
│
├── src/
│   ├── config/
│   ├── db/
│   ├── repositories/
│   ├── routes/
│   ├── schemas/
│   ├── services/
│   ├── app.js
│   └── server.js
│
├── tests/
│   ├── evaluationCases.js
│   ├── mismatchGuardService.test.js
│   └── similarityService.test.js
│
├── uploads/
├── workers/
│   └── imageProcessingWorker.js
│
├── .env.example
├── BUILDLOG.md
├── capstone.yaml
├── DESIGN.md
├── docker-compose.yml
├── EVIDENCE.md
├── package.json
└── README.md
```

---

## Local Setup

### Requirements

Install:

- Node.js
- npm
- Docker Desktop

Clone the repository and install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Add your Gemini API key to `.env`.

### One-command local runner

The repository includes a convenience command for starting the local capstone stack:

```bash
npm run capstone:run
```

This command:

- starts PostgreSQL with Docker Compose,
- waits for the database to become healthy,
- applies database migrations,
- starts the API,
- starts the image-processing worker.

In a second terminal, seed the reproducible demo corpus:

```bash
npm run db:seed
```

Use the image IDs printed by the seed script when creating a background image-processing job.

For a true clean-machine verification, remove the local database volume first and then repeat the startup and seed flow:

```bash
docker compose down -v
npm run capstone:run
```

---

## Environment Variables

Example configuration:

```env
PORT=3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5434/image_relevance

GEMINI_API_KEY=your_gemini_api_key_here

VISION_MODEL=gemini-3.6-flash
VISION_CONFIDENCE_THRESHOLD=0.80

EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768

AI_BUDGET_USD=1.00

MATCH_SIMILARITY_THRESHOLD=0.72
MATCH_STRONG_SIMILARITY_THRESHOLD=0.80
```

Do not commit the real `.env` file or API credentials.

---

## Start PostgreSQL

```bash
docker compose up -d
```

Verify:

```bash
docker compose ps
```

---

## Run Database Migrations

```bash
npm run db:migrate
```

---

## Seed Demo Tenant

```bash
npm run db:seed
```

---

## Start the API

```bash
npm run dev
```

API:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

---

## Start the Background Worker

Run this in a separate terminal:

```bash
npm run worker:image
```

The API and worker are separate processes.

---

## Useful Development Commands

Run the unit tests:

```bash
npm test
```

Run the complete evaluation corpus:

```bash
npm run eval
```

Run a direct vision test:

```bash
npm run vision:test -- <image-id>
```

Process an image directly:

```bash
npm run image:process -- <image-id>
```

Generate an image embedding:

```bash
npm run image:embed -- <image-id>
```

---

## Reliability Decisions

Several defensive design decisions are intentionally built into the project.

**Raw AI output is never trusted directly.**
Vision output must pass schema validation before persistence.

**Low-confidence classifications are not silently accepted.**
They are marked `review_required`.

**Review-required images cannot automatically enter the semantic index.**

**Similarity alone cannot approve a recommendation.**
Explicit subject mismatches can reject otherwise high-scoring candidates.

**No recommendation is a valid result.**
The system returns `no_confident_match` when all candidates are weak.

**Slow AI work runs through durable background jobs.**

**Background requests support idempotency.**

**Failed work is retried and eventually surfaced as a permanent failure.**

**AI calls are attributed by tenant and operation with estimated cost and latency.**

---

## Evidence and Documentation

Additional implementation documentation is available in:

### `DESIGN.md`

Architecture, data model, AI boundaries, matching strategy, and system design decisions.

### `BUILDLOG.md`

Implementation history, AI-assisted development notes, experiments, failures, and design changes.

### `EVIDENCE.md`

Observed acceptance behavior including:

- structured vision analysis
- low-confidence handling
- background jobs
- idempotency
- retries
- semantic ranking
- mismatch rejection
- no-confident-match behavior
- human review
- automated evaluation
- deterministic tests

### `docs/evaluation-results.json`

Machine-readable evaluation output containing per-case rankings, similarities, guard decisions, and explanations.

---

## Evaluation Summary

The current included capstone corpus demonstrates:

```text
Vision metadata validation       PASS
Low-confidence review flag       PASS
Background processing            PASS
Retry handling                    PASS
Idempotent job creation           PASS
Image embedding                   PASS
Post embedding                    PASS
Fox > wolf > dog ranking          PASS
Forced wolf mismatch rejection    PASS
No-confident-match behavior       PASS
Human review workflow             PASS
Automated evaluation              4/4 PASS
Deterministic unit tests          10/10 PASS
```

---

## Scope

This repository focuses on the backend AI engineering aspects of image understanding and recommendation.

The current implementation is deliberately small enough to run locally while still demonstrating:

- reliable AI integration
- durable asynchronous processing
- structured model validation
- semantic retrieval
- guardrail design
- cost awareness
- explainability
- human-in-the-loop review
- reproducible evaluation

The image corpus can be expanded later without changing the core architecture.
