# Design Document

## 1. Problem

Content systems often contain image libraries that are difficult to organize and safely match with written content.

This project will use vision AI to understand images and semantic embeddings to match them to blog posts.

The system will prioritize reliability over always returning a recommendation.

## 2. Core Principle

A wrong recommendation is worse than no recommendation.

If no candidate passes the required confidence and similarity thresholds, the system will return:

`no confident match`

## 3. Image Metadata Schema

Each image will produce structured metadata:

```json
{
    "subject": "red fox",
    "category": "animal",
    "attributes": ["orange fur", "wild", "forest"],
    "caption": "A red fox standing in a forest",
    "confidence": 0.94
}
```

All AI output must be schema validated before storage.

Low-confidence results will be flagged for review.

## 4. Main Data Models

- `images`
- `image_metadata`
- `image_embeddings`
- `posts`
- `post_embeddings`
- `suggestions`
- `reviews`
- `ai_calls`
- `background_jobs`

## 5. Matching Strategy

1. Generate validated metadata for each image.
2. Embed the image caption.
3. Embed blog post content.
4. Rank image candidates using cosine similarity.
5. Apply the mismatch guard.
6. Return accepted candidates or `no confident match`.

## 6. Mismatch Guard

The guard will use:

- semantic similarity
- vision confidence
- category consistency
- subject consistency

### Example

Post:

`The behavior of red foxes`

Candidate:

`A gray wolf in a forest`

Result:

`REJECTED`

Reason:

`Subject mismatch: expected fox, detected wolf.`

## 7. API Surface

Planned endpoints:

- `POST /images`
- `POST /jobs/image-processing`
- `GET /jobs/:id`
- `POST /posts`
- `GET /posts/:id/images`
- `POST /suggestions/:id/approve`
- `POST /suggestions/:id/reject`

## 8. Explicit Non-Goal

The first version will not build a large-scale image search platform or a complex frontend.

The initial system will use a small reproducible image corpus and a backend review workflow.