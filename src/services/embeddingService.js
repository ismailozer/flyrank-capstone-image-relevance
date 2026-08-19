require("dotenv").config();

function getEmbeddingDimensions() {
  const dimensions = Number(
    process.env.EMBEDDING_DIMENSIONS || 768
  );

  if (
    !Number.isInteger(dimensions) ||
    dimensions <= 0
  ) {
    throw new Error(
      "EMBEDDING_DIMENSIONS must be a positive integer."
    );
  }

  return dimensions;
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(
    vector.reduce(
      (sum, value) =>
        sum + value * value,
      0
    )
  );

  if (magnitude === 0) {
    throw new Error(
      "Embedding vector has zero magnitude."
    );
  }

  return vector.map(
    (value) => value / magnitude
  );
}

function estimateTokenCount(text) {
  // Used only for list-price cost estimation.
  // Actual matching behavior does not depend on this value.
  return Math.max(
    1,
    Math.ceil(text.length / 4)
  );
}

async function generateEmbedding(text) {
  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "Embedding input must be non-empty text."
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const {
    GoogleGenAI,
  } = await import("@google/genai");

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const model =
    process.env.EMBEDDING_MODEL ||
    "gemini-embedding-001";

  const dimensions =
    getEmbeddingDimensions();

  const startedAt = Date.now();

  const response =
    await client.models.embedContent({
      model,

      contents: text,

      config: {
        taskType:
          "SEMANTIC_SIMILARITY",

        outputDimensionality:
          dimensions,
      },
    });

  const latencyMs =
    Date.now() - startedAt;

  const rawVector =
    response.embeddings?.[0]?.values;

  if (
    !Array.isArray(rawVector) ||
    rawVector.length === 0
  ) {
    throw new Error(
      "Embedding model returned no vector."
    );
  }

  const vector =
    normalizeVector(rawVector);

  return {
    vector,
    model,
    dimensions: vector.length,
    latencyMs,

    estimatedInputTokens:
      estimateTokenCount(text),
  };
}

module.exports = {
  generateEmbedding,
  normalizeVector,
  estimateTokenCount,
};