const pool = require("../db/pool");


async function upsertSuggestion({
  postId,
  imageId,
  rank,
  similarityScore,
  guardDecision,
  guardReason,
}) {
  const result =
    await pool.query(
      `
        INSERT INTO suggestions (
          post_id,
          image_id,
          rank,
          similarity_score,
          guard_decision,
          guard_reason
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )

        ON CONFLICT (
          post_id,
          image_id
        )

        DO UPDATE SET
          rank =
            EXCLUDED.rank,

          similarity_score =
            EXCLUDED.similarity_score,

          guard_decision =
            EXCLUDED.guard_decision,

          guard_reason =
            EXCLUDED.guard_reason,

          created_at = NOW()

        RETURNING
          id,
          post_id,
          image_id,
          rank,
          similarity_score,
          guard_decision,
          guard_reason,
          created_at
      `,
      [
        postId,
        imageId,
        rank,
        similarityScore,
        guardDecision,
        guardReason,
      ]
    );

  return result.rows[0];
}


module.exports = {
  upsertSuggestion,
};