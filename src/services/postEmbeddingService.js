const {
  getPostById,
} = require(
  "../repositories/postRepository"
);

const {
  savePostEmbedding,
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
  estimateTokenCount,
} = require("./embeddingService");

const {
  assertAiBudgetAvailable,
} = require("./aiBudgetService");


function buildPostEmbeddingText(post) {
  return [
    `Title: ${post.title}`,
    `Content: ${post.body}`,
  ].join("\n");
}


function estimatePostEmbeddingRequest(
  post
) {
  const text =
    buildPostEmbeddingText(post);

  const model =
    process.env.EMBEDDING_MODEL ||
    "gemini-embedding-001";

  const estimatedInputTokens =
    estimateTokenCount(text);

  const estimatedCostUsd =
    calculateEmbeddingCost({
      model,
      estimatedInputTokens,
    });

  return {
    text,
    model,
    estimatedInputTokens,
    estimatedCostUsd,
  };
}


async function generatePostEmbedding(
  postId
) {
  const post =
    await getPostById(postId);

  if (!post) {
    throw new Error(
      `Post ${postId} does not exist.`
    );
  }

  const estimate =
    estimatePostEmbeddingRequest(
      post
    );

  /*
   * Authoritative provider-call guard.
   *
   * Keep this outside the try/catch:
   * a budget rejection is not a failed
   * provider call and therefore must not
   * create an ai_calls row.
   */
  const budgetBefore =
    await assertAiBudgetAvailable({
      tenantId:
        post.tenant_id,

      estimatedNextCostUsd:
        estimate.estimatedCostUsd,
    });

  const startedAt = Date.now();

  try {
    const embeddingResult =
      await generateEmbedding(
        estimate.text
      );

    const estimatedCostUsd =
      calculateEmbeddingCost({
        model:
          embeddingResult.model,

        estimatedInputTokens:
          embeddingResult
            .estimatedInputTokens,
      });

    const saved =
      await savePostEmbedding({
        postId,

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
          post.tenant_id,

        operation:
          "post_embedding",

        entityType:
          "post",

        entityId:
          post.id,

        provider:
          "google",

        model:
          embeddingResult.model,

        inputUnits:
          embeddingResult
            .estimatedInputTokens,

        outputUnits: 0,

        estimatedCostUsd,

        latencyMs:
          embeddingResult.latencyMs,

        status:
          "success",
      });

    return {
      postId,

      embeddingId:
        saved.id,

      model:
        embeddingResult.model,

      dimensions:
        embeddingResult.dimensions,

      estimatedCostUsd,

      aiCallId:
        aiCall.id,

      budget: {
        before:
          budgetBefore.currentSpend,

        estimatedNextCostUsd:
          budgetBefore
            .estimatedNextCostUsd,

        projectedSpend:
          budgetBefore
            .projectedSpend,

        limit:
          budgetBefore.budget,
      },
    };
  } catch (error) {
    const latencyMs =
      Date.now() - startedAt;

    await createAiCall({
      tenantId:
        post.tenant_id,

      operation:
        "post_embedding",

      entityType:
        "post",

      entityId:
        post.id,

      provider:
        "google",

      model:
        process.env
          .EMBEDDING_MODEL ||
        "gemini-embedding-001",

      inputUnits: 0,

      outputUnits: 0,

      estimatedCostUsd: 0,

      latencyMs,

      status:
        "failed",

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
  generatePostEmbedding,
  buildPostEmbeddingText,
  estimatePostEmbeddingRequest,
};