const {
  getImageById,
} = require(
  "../repositories/imageRepository"
);

const {
  getMetadataByImageId,
} = require(
  "../repositories/imageMetadataRepository"
);

const {
  saveImageEmbedding,
} = require(
  "../repositories/embeddingRepository"
);

const {
  createAiCall,
} = require(
  "../repositories/aiCallRepository"
);

const {
  calculateEmbeddingCost,
} = require(
  "../config/aiPricing"
);

const {
  generateEmbedding,
} = require("./embeddingService");

function buildImageEmbeddingText(
  metadata
) {
  return [
    `Subject: ${metadata.subject}`,
    `Category: ${metadata.category}`,
    `Attributes: ${metadata.attributes.join(
      ", "
    )}`,
    `Caption: ${metadata.caption}`,
  ].join("\n");
}

async function generateImageEmbedding(
  imageId
) {
  const image =
    await getImageById(imageId);

  if (!image) {
    throw new Error(
      `Image ${imageId} does not exist.`
    );
  }

  const metadata =
    await getMetadataByImageId(
      imageId
    );

  if (!metadata) {
    throw new Error(
      `Image ${imageId} has no validated metadata.`
    );
  }

  if (metadata.needs_review) {
    throw new Error(
      `Image ${imageId} requires review and cannot be embedded automatically.`
    );
  }

  const text =
    buildImageEmbeddingText(
      metadata
    );

  const startedAt = Date.now();

  try {
    const embeddingResult =
      await generateEmbedding(text);

    const estimatedCostUsd =
      calculateEmbeddingCost({
        model:
          embeddingResult.model,

        estimatedInputTokens:
          embeddingResult
            .estimatedInputTokens,
      });

    const saved =
      await saveImageEmbedding({
        imageId,
        model:
          embeddingResult.model,
        dimensions:
          embeddingResult.dimensions,
        embedding:
          embeddingResult.vector,
      });

    const aiCall =
      await createAiCall({
        tenantId:
          image.tenant_id,

        operation:
          "image_embedding",

        entityType: "image",
        entityId: image.id,

        provider: "google",

        model:
          embeddingResult.model,

        inputUnits:
          embeddingResult
            .estimatedInputTokens,

        outputUnits: 0,

        estimatedCostUsd,

        latencyMs:
          embeddingResult.latencyMs,

        status: "success",
      });

    return {
      imageId,
      embeddingId: saved.id,
      model:
        embeddingResult.model,

      dimensions:
        embeddingResult.dimensions,

      estimatedCostUsd,

      aiCallId:
        aiCall.id,
    };
  } catch (error) {
    const latencyMs =
      Date.now() - startedAt;

    await createAiCall({
      tenantId:
        image.tenant_id,

      operation:
        "image_embedding",

      entityType: "image",
      entityId: image.id,

      provider: "google",

      model:
        process.env
          .EMBEDDING_MODEL ||
        "gemini-embedding-001",

      inputUnits: 0,
      outputUnits: 0,
      estimatedCostUsd: 0,
      latencyMs,
      status: "failed",

      errorMessage:
        error.message.slice(
          0,
          1000
        ),
    }).catch(() => {});

    throw error;
  }
}

module.exports = {
  generateImageEmbedding,
  buildImageEmbeddingText,
};