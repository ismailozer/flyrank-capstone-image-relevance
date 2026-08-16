const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cosineSimilarity,
} = require(
  "../src/services/similarityService"
);


test(
  "identical vectors have cosine similarity 1",
  () => {
    const vector = [1, 2, 3];

    const similarity =
      cosineSimilarity(
        vector,
        vector
      );

    assert.ok(
      Math.abs(
        similarity - 1
      ) < 1e-10
    );
  }
);


test(
  "orthogonal vectors have cosine similarity 0",
  () => {
    const similarity =
      cosineSimilarity(
        [1, 0],
        [0, 1]
      );

    assert.equal(
      similarity,
      0
    );
  }
);


test(
  "different vector dimensions are rejected",
  () => {
    assert.throws(
      () =>
        cosineSimilarity(
          [1, 2],
          [1, 2, 3]
        ),

      /dimensions do not match/i
    );
  }
);


test(
  "empty vectors are rejected",
  () => {
    assert.throws(
      () =>
        cosineSimilarity(
          [],
          []
        ),

      /cannot be empty/i
    );
  }
);