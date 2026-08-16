const pool = require("../db/pool");

async function createPost({
  tenantId,
  title,
  body,
}) {
  const result = await pool.query(
    `
      INSERT INTO posts (
        tenant_id,
        title,
        body
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        tenant_id,
        title,
        body,
        created_at,
        updated_at
    `,
    [
      tenantId,
      title,
      body,
    ]
  );

  return result.rows[0];
}

async function getPostById(id) {
  const result = await pool.query(
    `
      SELECT
        id,
        tenant_id,
        title,
        body,
        created_at,
        updated_at
      FROM posts
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createPost,
  getPostById,
};