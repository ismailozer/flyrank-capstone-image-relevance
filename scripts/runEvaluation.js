require("dotenv").config();

const fs = require("fs");
const path = require("path");

const pool =
  require("../src/db/pool");

const {
  createPost,
} = require(
  "../src/repositories/postRepository"
);

const {
  generatePostEmbedding,
} = require(
  "../src/services/postEmbeddingService"
);

const {
  rankImagesForPost,
} = require(
  "../src/services/matchingService"
);

const {
  evaluationCases,
} = require(
  "../tests/evaluationCases"
);


function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


async function evaluateCase(
  evaluationCase
) {
  console.log(
    `\n[eval] ${evaluationCase.name}`
  );

  const post =
    await createPost({
      tenantId: 1,

      title:
        evaluationCase.title,

      body:
        evaluationCase.body,
    });

  await generatePostEmbedding(
    post.id
  );

  const result =
    await rankImagesForPost(
      post.id
    );

  const bestMatch =
    result.bestMatch;

  let passed = false;

  if (
    evaluationCase.expectedOutcome ===
    "no_confident_match"
  ) {
    passed =
      result.status ===
        "no_confident_match" &&
      bestMatch === null;
  } else {
    passed =
      result.status === "matched" &&
      bestMatch !== null &&
      normalize(
        bestMatch.subject
      ) ===
        normalize(
          evaluationCase.expectedSubject
        );
  }

  const rejectedCandidates =
    result.candidates.filter(
      (candidate) =>
        candidate.decision ===
        "rejected"
    );

  const caseResult = {
    name:
      evaluationCase.name,

    postId:
      post.id,

    expectedOutcome:
      evaluationCase.expectedOutcome,

    expectedSubject:
      evaluationCase.expectedSubject,

    actualStatus:
      result.status,

    actualBestSubject:
      bestMatch?.subject ?? null,

    bestSimilarity:
      bestMatch?.similarity ?? null,

    passed,

    candidates:
      result.candidates.map(
        (candidate) => ({
          rank:
            candidate.rank,

          subject:
            candidate.subject,

          similarity:
            candidate.similarity,

          decision:
            candidate.decision,

          decisionCode:
            candidate.decisionCode,

          reason:
            candidate.reason,
        })
      ),

    rejectedCandidateCount:
      rejectedCandidates.length,
  };

  console.log(
    `[eval] expected: ${
      evaluationCase.expectedSubject ??
      evaluationCase.expectedOutcome
    }`
  );

  console.log(
    `[eval] actual: ${
      bestMatch?.subject ??
      result.status
    }`
  );

  console.log(
    `[eval] ${
      passed ? "PASS" : "FAIL"
    }`
  );

  return caseResult;
}


async function run() {
  console.log(
    "======================================"
  );

  console.log(
    " FlyRank Image Relevance Evaluation"
  );

  console.log(
    "======================================"
  );

  const results = [];

  for (
    const evaluationCase
    of evaluationCases
  ) {
    const result =
      await evaluateCase(
        evaluationCase
      );

    results.push(result);
  }

  const positiveCases =
    results.filter(
      (result) =>
        result.expectedOutcome ===
        "match"
    );

  const negativeCases =
    results.filter(
      (result) =>
        result.expectedOutcome ===
        "no_confident_match"
    );

  const top1Correct =
    positiveCases.filter(
      (result) =>
        result.passed
    ).length;

  const noMatchCorrect =
    negativeCases.filter(
      (result) =>
        result.passed
    ).length;

  const overallCorrect =
    results.filter(
      (result) =>
        result.passed
    ).length;

  const similarities =
    positiveCases
      .map(
        (result) =>
          result.bestSimilarity
      )
      .filter(
        (value) =>
          typeof value === "number"
      );

  const averageWinningSimilarity =
    similarities.length > 0
      ? similarities.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / similarities.length
      : 0;

  const totalRejectedCandidates =
    results.reduce(
      (sum, result) =>
        sum +
        result.rejectedCandidateCount,
      0
    );

  const summary = {
    generatedAt:
      new Date().toISOString(),

    totalCases:
      results.length,

    passedCases:
      overallCorrect,

    failedCases:
      results.length -
      overallCorrect,

    overallAccuracy:
      Number(
        (
          overallCorrect /
          results.length
        ).toFixed(4)
      ),

    top1: {
      correct:
        top1Correct,

      total:
        positiveCases.length,

      accuracy:
        Number(
          (
            top1Correct /
            positiveCases.length
          ).toFixed(4)
        ),
    },

    noMatch: {
      correct:
        noMatchCorrect,

      total:
        negativeCases.length,

      accuracy:
        negativeCases.length > 0
          ? Number(
              (
                noMatchCorrect /
                negativeCases.length
              ).toFixed(4)
            )
          : null,
    },

    averageWinningSimilarity:
      Number(
        averageWinningSimilarity
          .toFixed(6)
      ),

    totalRejectedCandidates,
  };

  const report = {
    summary,
    cases: results,
  };

  const outputDirectory =
    path.join(
      process.cwd(),
      "docs"
    );

  fs.mkdirSync(
    outputDirectory,
    {
      recursive: true,
    }
  );

  const outputPath =
    path.join(
      outputDirectory,
      "evaluation-results.json"
    );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    "\n======================================"
  );

  console.log(
    " Evaluation Summary"
  );

  console.log(
    "======================================"
  );

  console.log(
    `Passed: ${summary.passedCases}/${summary.totalCases}`
  );

  console.log(
    `Overall accuracy: ${(
      summary.overallAccuracy * 100
    ).toFixed(2)}%`
  );

  console.log(
    `Top-1 accuracy: ${(
      summary.top1.accuracy * 100
    ).toFixed(2)}%`
  );

  if (
    summary.noMatch.accuracy !==
    null
  ) {
    console.log(
      `No-match accuracy: ${(
        summary.noMatch.accuracy *
        100
      ).toFixed(2)}%`
    );
  }

  console.log(
    `Average winning similarity: ${summary.averageWinningSimilarity}`
  );

  console.log(
    `Guard rejections observed: ${summary.totalRejectedCandidates}`
  );

  console.log(
    `\nReport written to: ${outputPath}`
  );

  if (
    summary.failedCases > 0
  ) {
    process.exitCode = 1;
  }
}


run()
  .catch((error) => {
    console.error(
      "\n[eval] fatal error:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });