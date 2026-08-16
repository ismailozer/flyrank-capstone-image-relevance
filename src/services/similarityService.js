function cosineSimilarity(
  vectorA,
  vectorB
) {
  if (
    !Array.isArray(vectorA) ||
    !Array.isArray(vectorB)
  ) {
    throw new Error(
      "Both embeddings must be arrays."
    );
  }

  if (
    vectorA.length !==
    vectorB.length
  ) {
    throw new Error(
      "Embedding dimensions do not match."
    );
  }

  if (vectorA.length === 0) {
    throw new Error(
      "Embedding vectors cannot be empty."
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (
    let index = 0;
    index < vectorA.length;
    index += 1
  ) {
    const valueA =
      Number(vectorA[index]);

    const valueB =
      Number(vectorB[index]);

    dotProduct +=
      valueA * valueB;

    magnitudeA +=
      valueA * valueA;

    magnitudeB +=
      valueB * valueB;
  }

  const denominator =
    Math.sqrt(magnitudeA) *
    Math.sqrt(magnitudeB);

  if (denominator === 0) {
    return 0;
  }

  return (
    dotProduct / denominator
  );
}

module.exports = {
  cosineSimilarity,
};