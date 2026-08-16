const {
  getImageById,
} = require("../repositories/imageRepository");

const {
  saveImageAnalysis,
} = require("../repositories/imageMetadataRepository");

const {
  analyzeImage,
} = require("./visionService");

function getConfidenceThreshold() {
  const value = Number(
    process.env.VISION_CONFIDENCE_THRESHOLD || 0.75
  );

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      "VISION_CONFIDENCE_THRESHOLD must be between 0 and 1."
    );
  }

  return value;
}

async function processImage(imageId) {
  const image = await getImageById(imageId);

  if (!image) {
    throw new Error(
      `Image ${imageId} does not exist.`
    );
  }

  const metadata = await analyzeImage({
    filePath: image.file_path,
    mimeType: image.mime_type,
  });

  const threshold = getConfidenceThreshold();

  const processingStatus =
    metadata.confidence < threshold
      ? "review_required"
      : "processed";

  const result = await saveImageAnalysis({
    imageId: image.id,
    metadata,
    processingStatus,
  });

  return {
    ...result,
    confidenceThreshold: threshold,
  };
}

module.exports = {
  processImage,
};