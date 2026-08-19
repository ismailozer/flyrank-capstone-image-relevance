const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const {
  createImage,
  findImageByHash,
} = require("../repositories/imageRepository");

async function calculateSha256(filePath) {
  const fileBuffer = await fs.readFile(filePath);

  return crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex");
}

async function removeUploadedFile(filePath) {
  await fs.unlink(filePath).catch(() => {});
}

async function ingestImage({
  tenantId,
  file,
}) {
  const sha256 =
    await calculateSha256(
      file.path
    );

  const existingImage =
    await findImageByHash({
      tenantId,
      sha256,
    });

  if (existingImage) {
    await removeUploadedFile(
      file.path
    );

    return {
      image: existingImage,
      duplicate: true,
    };
  }

  const relativeFilePath = path
    .relative(
      process.cwd(),
      file.path
    )
    .replace(/\\/g, "/");

  try {
    const image =
      await createImage({
        tenantId,
        originalFilename:
          file.originalname,
        filePath:
          relativeFilePath,
        mimeType:
          file.mimetype,
        sha256,
      });

    return {
      image,
      duplicate: false,
    };
  } catch (error) {
    /*
     * PostgreSQL unique_violation.
     *
     * Another request may have inserted
     * the same tenant + SHA-256 between
     * our initial lookup and INSERT.
     */
    if (error.code === "23505") {
      const concurrentImage =
        await findImageByHash({
          tenantId,
          sha256,
        });

      if (concurrentImage) {
        await removeUploadedFile(
          file.path
        );

        return {
          image:
            concurrentImage,
          duplicate: true,
        };
      }
    }

    throw error;
  }
}

module.exports = {
  ingestImage,
};