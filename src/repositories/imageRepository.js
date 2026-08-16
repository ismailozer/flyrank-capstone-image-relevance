const pool = require("../db/pool");

async function createImage({
  tenantId,
  originalFilename,
  filePath,
  mimeType,
  sha256,
}) {
  const result = await pool.query(
    `
      INSERT INTO images (
        tenant_id,
        original_filename,
        file_path,
        mime_type,
        sha256,
        processing_status
      )
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING
        id,
        tenant_id,
        original_filename,
        file_path,
        mime_type,
        sha256,
        processing_status,
        created_at,
        updated_at
    `,
    [
      tenantId,
      originalFilename,
      filePath,
      mimeType,
      sha256,
    ]
  );

  return result.rows[0];
}

async function getImageById(id) {
  const result = await pool.query(
    `
      SELECT
        id,
        tenant_id,
        original_filename,
        file_path,
        mime_type,
        sha256,
        processing_status,
        created_at,
        updated_at
      FROM images
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findImageByHash({
  tenantId,
  sha256,
}) {
  const result = await pool.query(
    `
      SELECT
        id,
        tenant_id,
        original_filename,
        file_path,
        mime_type,
        sha256,
        processing_status,
        created_at,
        updated_at
      FROM images
      WHERE tenant_id = $1
        AND sha256 = $2
      ORDER BY id ASC
      LIMIT 1
    `,
    [tenantId, sha256]
  );

  return result.rows[0] || null;
}

module.exports = {
  createImage,
  getImageById,
  findImageByHash,
};