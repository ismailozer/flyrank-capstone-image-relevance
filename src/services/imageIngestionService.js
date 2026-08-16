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

async function ingestImage({
  tenantId,
  file,
}) {
  const sha256 = await calculateSha256(file.path);

  const existingImage = await findImageByHash({
    tenantId,
    sha256,
  });

  if (existingImage) {
    await fs.unlink(file.path).catch(() => {});

    return {
      image: existingImage,
      duplicate: true,
    };
  }

  const relativeFilePath = path
    .relative(process.cwd(), file.path)
    .replace(/\\/g, "/");

  const image = await createImage({
    tenantId,
    originalFilename: file.originalname,
    filePath: relativeFilePath,
    mimeType: file.mimetype,
    sha256,
  });

  return {
    image,
    duplicate: false,
  };
}

module.exports = {
  ingestImage,
};