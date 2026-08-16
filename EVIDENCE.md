# Evidence

## Foundation

### Database migrations

The PostgreSQL schema is managed through versioned migrations.

Proof:

```text
[migration] applying: 001_initial_schema.sql
[migration] completed: 001_initial_schema.sql
[migration] all migrations completed
```

Running the migration command again does not apply the migration twice:

```text
[migration] already applied: 001_initial_schema.sql
[migration] all migrations completed
```

### Database persistence

The initial schema contains persistent tables for:

* images
* image metadata
* image tags
* image embeddings
* posts
* post embeddings
* suggestions
* reviews
* background jobs
* AI call tracking
* tenants

### Seed idempotency

The first seed execution creates the demo tenant:

```text
[seed] demo tenant created
```

A second execution safely reuses the existing tenant:

```text
[seed] demo tenant already exists
```

### API health check

`GET /health`

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

### Unknown endpoint handling

`GET /test`

```json
{
  "error": "not_found",
  "message": "The requested endpoint does not exist."
}
```

## Structured Vision Output

A real image was processed with Gemini and the returned JSON was validated against the application Zod schema.

Test image:

`fox_55.jpg`

Validated result:

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

The model output was accepted only after schema validation.

Observed latency:

`6278 ms`

## AI Usage and Cost Tracking

A real vision analysis call is attributed to the processed image and stored in PostgreSQL.

Observed call:

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

The output units include normal output tokens and reasoning/thought tokens.

Tenant-level estimated spend:

```yaml
tenant_id: 1
calls: 1
estimated_cost: 0.00282300
```

The tenant also has an AI budget guard before model execution.

## Background Image Processing

Image analysis runs asynchronously through a PostgreSQL-backed background job.

A request to:

`POST /jobs/image-processing`

returned immediately with a job reference while the worker processed the image separately.

Observed worker execution:

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

## Idempotency

The same batch request was submitted again with the same Idempotency-Key.

Result:

```text
job_id: 1
status: completed
duplicate: True
```

The database still contained exactly one background job:

```text
id: 1
job_type: image_processing
status: completed
idempotency_key: image-processing:1:fox-batch-001
total_items: 1
processed_items: 1
```

This proves that retrying the same batch request does not create duplicate work.

## Multi-Image Batch Processing

A single background job successfully processed three semantically similar animal images.

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

Validated database results:

```text
fox_55.jpg | red fox                  | animal | 0.98 | processed
wolf_1.jpg | black wolf               | animal | 0.95 | processed
dog_8.jpg  | black Labrador Retriever | animal | 0.98 | processed
```

All images were processed asynchronously and stored with schema-valid structured metadata.

## Background Job Retry and Failure Handling

A controlled provider failure was introduced by configuring an invalid vision model.

The worker retried the image three times:

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

Final persisted state:

```text
job status: failed
attempt_count: 3
max_attempts: 3
failed_items: 1

item status: failed
item attempt_count: 3
item max_attempts: 3
```

Each failed model call was also recorded in ai_calls with:

```text
model: invalid-test-model
status: failed
error_message: provider 404
```

This proves that transient/background failures are retried up to the configured limit and then become visible permanent failures rather than disappearing silently.

## Low-Confidence Classification Handling

An intentionally ambiguous image was analyzed by the vision model.

Validated output:

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
  "confidence": 0.7
}
```

The first direct vision test returned a confidence score of `0.70`.

When the same ambiguous image was processed through the production
background pipeline, the persisted classification returned:

```text
confidence: 0.65
needs_review: true
processing_status: review_required
```

The configured confidence threshold is:
```
0.75
```
Because:
```
0.70 < 0.75
```
the application did not silently accept the classification.