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