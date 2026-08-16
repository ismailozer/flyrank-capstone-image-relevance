const pool = require("../db/pool");

async function saveImageAnalysis({
  imageId,
  metadata,
  processingStatus,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO image_metadata (
          image_id,
          subject,
          category,
          attributes,
          caption,
          confidence,
          needs_review,
          raw_model_output
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb
        )
        ON CONFLICT (image_id)
        DO UPDATE SET
          subject = EXCLUDED.subject,
          category = EXCLUDED.category,
          attributes = EXCLUDED.attributes,
          caption = EXCLUDED.caption,
          confidence = EXCLUDED.confidence,
          needs_review = EXCLUDED.needs_review,
          raw_model_output = EXCLUDED.raw_model_output,
          updated_at = NOW()
      `,
      [
        imageId,
        metadata.subject,
        metadata.category,
        metadata.attributes,
        metadata.caption,
        metadata.confidence,
        processingStatus === "review_required",
        JSON.stringify(metadata),
      ]
    );

    await client.query(
      `
        DELETE FROM image_tags
        WHERE image_id = $1
      `,
      [imageId]
    );

    const tags = [
      metadata.subject,
      metadata.category,
      ...metadata.attributes,
    ];

    const normalizedTags = [
      ...new Set(
        tags
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    for (const tag of normalizedTags) {
      await client.query(
        `
          INSERT INTO image_tags (
            image_id,
            tag
          )
          VALUES ($1, $2)
          ON CONFLICT (image_id, tag)
          DO NOTHING
        `,
        [imageId, tag]
      );
    }

    await client.query(
      `
        UPDATE images
        SET
          processing_status = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [imageId, processingStatus]
    );

    await client.query("COMMIT");

    return {
      imageId,
      metadata,
      tags: normalizedTags,
      processingStatus,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getMetadataByImageId(imageId) {
  const result = await pool.query(
    `
      SELECT
        im.id,
        im.image_id,
        im.subject,
        im.category,
        im.attributes,
        im.caption,
        im.confidence,
        im.needs_review,
        im.created_at,
        im.updated_at
      FROM image_metadata im
      WHERE im.image_id = $1
    `,
    [imageId]
  );

  return result.rows[0] || null;
}

module.exports = {
  saveImageAnalysis,
  getMetadataByImageId,
};