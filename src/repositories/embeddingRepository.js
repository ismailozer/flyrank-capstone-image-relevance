const pool = require("../db/pool");

async function saveImageEmbedding({
  imageId,
  model,
  dimensions,
  embedding,
}) {
  const result = await pool.query(
    `
      INSERT INTO image_embeddings (
        image_id,
        model,
        dimensions,
        embedding
      )
      VALUES (
        $1,
        $2,
        $3,
        $4
      )
      ON CONFLICT (image_id)
      DO UPDATE SET
        model = EXCLUDED.model,
        dimensions = EXCLUDED.dimensions,
        embedding = EXCLUDED.embedding,
        created_at = NOW()
      RETURNING
        id,
        image_id,
        model,
        dimensions,
        created_at
    `,
    [
      imageId,
      model,
      dimensions,
      embedding,
    ]
  );

  return result.rows[0];
}

async function getImageEmbedding(
  imageId
) {
  const result = await pool.query(
    `
      SELECT
        id,
        image_id,
        model,
        dimensions,
        embedding,
        created_at
      FROM image_embeddings
      WHERE image_id = $1
    `,
    [imageId]
  );

  return result.rows[0] || null;
}

async function savePostEmbedding({
  postId,
  model,
  dimensions,
  embedding,
}) {
  const result = await pool.query(
    `
      INSERT INTO post_embeddings (
        post_id,
        model,
        dimensions,
        embedding
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (post_id)
      DO UPDATE SET
        model = EXCLUDED.model,
        dimensions = EXCLUDED.dimensions,
        embedding = EXCLUDED.embedding,
        created_at = NOW()
      RETURNING
        id,
        post_id,
        model,
        dimensions,
        created_at
    `,
    [
      postId,
      model,
      dimensions,
      embedding,
    ]
  );

  return result.rows[0];
}

async function getPostEmbedding(postId) {
  const result = await pool.query(
    `
      SELECT
        id,
        post_id,
        model,
        dimensions,
        embedding,
        created_at
      FROM post_embeddings
      WHERE post_id = $1
    `,
    [postId]
  );

  return result.rows[0] || null;
}

async function getCandidateImageEmbeddings(
  tenantId
) {
  const result = await pool.query(
    `
      SELECT
        i.id AS image_id,
        i.original_filename,

        im.subject,
        im.category,
        im.attributes,
        im.caption,
        im.confidence,
        im.needs_review,

        ie.model,
        ie.dimensions,
        ie.embedding

      FROM images i

      INNER JOIN image_metadata im
        ON im.image_id = i.id

      INNER JOIN image_embeddings ie
        ON ie.image_id = i.id

      WHERE i.tenant_id = $1
        AND i.processing_status = 'processed'
        AND im.needs_review = FALSE

      ORDER BY i.id
    `,
    [tenantId]
  );

  return result.rows;
}

module.exports = {
  saveImageEmbedding,
  getImageEmbedding,
  savePostEmbedding,
  getPostEmbedding,
  getCandidateImageEmbeddings,
};