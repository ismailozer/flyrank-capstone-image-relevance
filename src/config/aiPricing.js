const PRICING = {
  "gemini-3.6-flash": {
    inputPerMillionUsd: 0.75,
    outputPerMillionUsd: 3.75,
  },
};

function calculateVisionCost({
  model,
  inputTokens,
  outputTokens,
  thoughtTokens,
}) {
  const pricing = PRICING[model];

  if (!pricing) {
    throw new Error(
      `No pricing configuration exists for model: ${model}`
    );
  }

  const billableOutputTokens =
    outputTokens + thoughtTokens;

  const inputCost =
    (inputTokens / 1_000_000) *
    pricing.inputPerMillionUsd;

  const outputCost =
    (billableOutputTokens / 1_000_000) *
    pricing.outputPerMillionUsd;

  return Number(
    (inputCost + outputCost).toFixed(8)
  );
}

module.exports = {
  PRICING,
  calculateVisionCost,
};