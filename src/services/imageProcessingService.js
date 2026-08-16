const {
  getImageById,
} = require("../repositories/imageRepository");

const {
  saveImageAnalysis,
} = require("../repositories/imageMetadataRepository");

const {
  createAiCall,
  getTenantEstimatedSpend,
} = require("../repositories/aiCallRepository");

const {
  getTenantById,
} = require("../repositories/tenantRepository");

const {
  calculateVisionCost,
} = require("../config/aiPricing");

const {
  analyzeImage,
} = require("./visionService");

function getConfidenceThreshold() {
  const value = Number(
    process.env.VISION_CONFIDENCE_THRESHOLD ||
      0.75
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

async function assertBudgetAvailable(
  tenantId
) {
  const tenant =
    await getTenantById(tenantId);

  if (!tenant) {
    throw new Error(
      `Tenant ${tenantId} does not exist.`
    );
  }

  const currentSpend =
    await getTenantEstimatedSpend(
      tenantId
    );

  const budget = Number(
    tenant.ai_budget_usd
  );

  if (currentSpend >= budget) {
    throw new Error(
      `AI budget exceeded for tenant ${tenantId}. ` +
      `Current estimated spend: $${currentSpend.toFixed(
        6
      )}, budget: $${budget.toFixed(2)}`
    );
  }

  return {
    currentSpend,
    budget,
  };
}

async function processImage(imageId) {
  const image =
    await getImageById(imageId);

  if (!image) {
    throw new Error(
      `Image ${imageId} does not exist.`
    );
  }

  const budgetBefore =
    await assertBudgetAvailable(
      image.tenant_id
    );

  const startedAt = Date.now();

  try {
    const visionResult =
      await analyzeImage({
        filePath: image.file_path,
        mimeType: image.mime_type,
      });

    const latencyMs =
      Date.now() - startedAt;

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

    const aiCall =
      await createAiCall({
        tenantId: image.tenant_id,
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
        latencyMs,
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
        imageId: image.id,
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
      },
    };
  } catch (error) {
    const latencyMs =
      Date.now() - startedAt;

    await createAiCall({
      tenantId: image.tenant_id,
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
        error.message.slice(0, 1000),
    }).catch((logError) => {
      console.error(
        "[ai-cost] failed to log failed AI call:",
        logError.message
      );
    });

    throw error;
  }
}

module.exports = {
  processImage,
};