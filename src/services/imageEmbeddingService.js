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
  assertAiBudgetAvailable,
} = require(
  "./aiBudgetService"
);

const {
  generateEmbedding,
  estimateTokenCount,
} = require(
  "./embeddingService"
);


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


async function logFailedEmbeddingCall({
  image,
  startedAt,
  error,
}) {
  await createAiCall({
    tenantId:
      image.tenant_id,

    operation:
      "image_embedding",

    entityType: "image",
    entityId: image.id,

    provider: "google",

    model:
      process.env.EMBEDDING_MODEL ||
      "gemini-embedding-001",

    inputUnits: 0,
    outputUnits: 0,

    estimatedCostUsd: 0,

    latencyMs:
      Date.now() - startedAt,

    status: "failed",

    errorMessage:
      error.message.slice(
        0,
        1000
      ),
  }).catch((logError) => {
    console.error(
      "[ai-cost] failed to log failed image embedding call:",
      logError.message
    );
  });
}


async function generateImageEmbedding(
  imageId
) {
  const image =
    await getImageById(
      imageId
    );

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

  const model =
    process.env.EMBEDDING_MODEL ||
    "gemini-embedding-001";

  /*
   * Embedding cost can be estimated
   * before contacting the provider.
   */
  const estimatedInputTokens =
    estimateTokenCount(
      text
    );

  const estimatedNextCostUsd =
    calculateEmbeddingCost({
      model,

      estimatedInputTokens,
    });

  const budgetBefore =
    await assertAiBudgetAvailable({
      tenantId:
        image.tenant_id,

      estimatedNextCostUsd,
    });

  const providerStartedAt =
    Date.now();

  let embeddingResult;

  try {
    embeddingResult =
      await generateEmbedding(
        text
      );
  } catch (error) {
    await logFailedEmbeddingCall({
      image,

      startedAt:
        providerStartedAt,

      error,
    });

    throw error;
  }

  const actualEstimatedCostUsd =
    calculateEmbeddingCost({
      model:
        embeddingResult.model,

      estimatedInputTokens:
        embeddingResult
          .estimatedInputTokens,
    });

  /*
   * Provider succeeded.
   * Log the provider call before
   * downstream persistence.
   */
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

      estimatedCostUsd:
        actualEstimatedCostUsd,

      latencyMs:
        embeddingResult.latencyMs,

      status: "success",
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

  return {
    imageId,

    embeddingId:
      saved.id,

    model:
      embeddingResult.model,

    dimensions:
      embeddingResult.dimensions,

    estimatedCostUsd:
      actualEstimatedCostUsd,

    aiCallId:
      aiCall.id,

    budget: {
      before:
        budgetBefore.currentSpend,

      limit:
        budgetBefore.budget,

      projectedBeforeCall:
        budgetBefore.projectedSpend,

      estimatedAfter:
        budgetBefore.currentSpend +
        actualEstimatedCostUsd,
    },
  };
}


module.exports = {
  generateImageEmbedding,
  buildImageEmbeddingText,
};