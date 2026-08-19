CREATE UNIQUE INDEX IF NOT EXISTS idx_images_tenant_sha256
ON images (tenant_id, sha256);