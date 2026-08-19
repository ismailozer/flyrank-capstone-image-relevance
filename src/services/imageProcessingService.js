const {
  getImageById,
} = require(
  "../repositories/imageRepository"
);

const {
  saveImageAnalysis,
} = require(
  "../repositories/imageMetadataRepository"
);

const {
  createAiCall,
} = require(
  "../repositories/aiCallRepository"
);

const {
  calculateVisionCost,
} = require(
  "../config/aiPricing"
);

const {
  assertAiBudgetAvailable,
} = require(
  "./aiBudgetService"
);

const {
  analyzeImage,
} = require(
  "./visionService"
);


function getConfidenceThreshold() {
  const value = Number(
    process.env
      .VISION_CONFIDENCE_THRESHOLD ||
      0.80
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


async function logFailedVisionCall({
  image,
  startedAt,
  error,
}) {
  const latencyMs =
    Date.now() - startedAt;

  await createAiCall({
    tenantId:
      image.tenant_id,

    operation:
      "vision_analysis",

    entityType: "image",
    entityId: image.id,

    provider: "google",

    model:
      process.env.VISION_MODEL ||
      "gemini-3.6-flash",

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
  }).catch((logError) => {
    console.error(
      "[ai-cost] failed to log failed vision call:",
      logError.message
    );
  });
}


async function processImage(imageId) {
  const image =
    await getImageById(
      imageId
    );

  if (!image) {
    throw new Error(
      `Image ${imageId} does not exist.`
    );
  }

  /*
   * Vision token usage is only known
   * after the provider responds.
   *
   * This preflight therefore guarantees
   * that a tenant which has already
   * exhausted its budget cannot start
   * another provider request.
   */
  const budgetBefore =
    await assertAiBudgetAvailable({
      tenantId:
        image.tenant_id,

      estimatedNextCostUsd: 0,
    });

  const providerStartedAt =
    Date.now();

  let visionResult;

  /*
   * Keep the provider call in its own
   * try/catch.
   *
   * Database persistence failures after
   * a successful provider response must
   * not be logged as failed AI calls.
   */
  try {
    visionResult =
      await analyzeImage({
        filePath:
          image.file_path,

        mimeType:
          image.mime_type,
      });
  } catch (error) {
    await logFailedVisionCall({
      image,
      startedAt:
        providerStartedAt,
      error,
    });

    throw error;
  }

  const providerLatencyMs =
    Date.now() -
    providerStartedAt;

  const {
    metadata,
    usage,
    model,
  } = visionResult;

  const estimatedCostUsd =
    calculateVisionCost({
      model,

      inputTokens:
        usage.inputTokens,

      outputTokens:
        usage.outputTokens,

      thoughtTokens:
        usage.thoughtTokens,
    });

  const billableOutputUnits =
    usage.outputTokens +
    usage.thoughtTokens;

  /*
   * The provider call succeeded.
   * Record that fact before performing
   * downstream metadata persistence.
   */
  const aiCall =
    await createAiCall({
      tenantId:
        image.tenant_id,

      operation:
        "vision_analysis",

      entityType: "image",
      entityId: image.id,

      provider: "google",
      model,

      inputUnits:
        usage.inputTokens,

      outputUnits:
        billableOutputUnits,

      estimatedCostUsd,

      latencyMs:
        providerLatencyMs,

      status: "success",
    });

  const threshold =
    getConfidenceThreshold();

  const processingStatus =
    metadata.confidence <
    threshold
      ? "review_required"
      : "processed";

  const savedAnalysis =
    await saveImageAnalysis({
      imageId:
        image.id,

      metadata,

      processingStatus,
    });

  return {
    ...savedAnalysis,

    confidenceThreshold:
      threshold,

    aiUsage: {
      inputTokens:
        usage.inputTokens,

      outputTokens:
        usage.outputTokens,

      thoughtTokens:
        usage.thoughtTokens,

      totalTokens:
        usage.totalTokens,

      estimatedCostUsd,
    },

    aiCallId:
      aiCall.id,

    budget: {
      before:
        budgetBefore.currentSpend,

      limit:
        budgetBefore.budget,

      estimatedAfter:
        budgetBefore.currentSpend +
        estimatedCostUsd,
    },
  };
}


module.exports = {
  processImage,
};