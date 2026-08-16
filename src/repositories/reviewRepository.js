const pool = require("../db/pool");


async function getSuggestionById(
  suggestionId
) {
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.post_id,
        s.image_id,
        s.rank,
        s.similarity_score,
        s.guard_decision,
        s.guard_reason,
        s.created_at,

        p.title AS post_title,

        i.original_filename,

        im.subject,
        im.category,
        im.confidence

      FROM suggestions s

      INNER JOIN posts p
        ON p.id = s.post_id

      INNER JOIN images i
        ON i.id = s.image_id

      LEFT JOIN image_metadata im
        ON im.image_id = i.id

      WHERE s.id = $1
    `,
    [suggestionId]
  );

  return result.rows[0] || null;
}


async function createReview({
  suggestionId,
  action,
  notes = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO reviews (
        suggestion_id,
        action,
        notes
      )
      VALUES ($1, $2, $3)

      RETURNING
        id,
        suggestion_id,
        action,
        notes,
        created_at
    `,
    [
      suggestionId,
      action,
      notes,
    ]
  );

  return result.rows[0];
}


async function getReviewsForSuggestion(
  suggestionId
) {
  const result = await pool.query(
    `
      SELECT
        id,
        suggestion_id,
        action,
        notes,
        created_at

      FROM reviews

      WHERE suggestion_id = $1

      ORDER BY created_at DESC, id DESC
    `,
    [suggestionId]
  );

  return result.rows;
}


async function getLatestReview(
  suggestionId
) {
  const result = await pool.query(
    `
      SELECT
        id,
        suggestion_id,
        action,
        notes,
        created_at

      FROM reviews

      WHERE suggestion_id = $1

      ORDER BY created_at DESC, id DESC

      LIMIT 1
    `,
    [suggestionId]
  );

  return result.rows[0] || null;
}


module.exports = {
  getSuggestionById,
  createReview,
  getReviewsForSuggestion,
  getLatestReview,
};