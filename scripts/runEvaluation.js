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


function isCorrectTop1Match({
  expectedOutcome,
  expectedSubject,
  actualStatus,
  actualBestSubject,
}) {
  if (
    expectedOutcome !== "match"
  ) {
    return false;
  }

  return (
    actualStatus === "matched" &&
    actualBestSubject !== null &&
    normalize(actualBestSubject) ===
      normalize(expectedSubject)
  );
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

  const actualBestSubject =
    bestMatch?.subject ?? null;

  const correctTop1 =
    isCorrectTop1Match({
      expectedOutcome:
        evaluationCase.expectedOutcome,

      expectedSubject:
        evaluationCase.expectedSubject,

      actualStatus:
        result.status,

      actualBestSubject,
    });

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
    passed = correctTop1;
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

    actualBestSubject,

    bestSimilarity:
      bestMatch?.similarity ?? null,

    correctTop1,

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
      actualBestSubject ??
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


  const matchedPredictions =
    results.filter(
      (result) =>
        result.actualStatus ===
        "matched" &&
        result.actualBestSubject !==
          null
    );


  const abstainedPredictions =
    results.filter(
      (result) =>
        result.actualStatus ===
        "no_confident_match"
    );


  const top1Correct =
    results.filter(
      (result) =>
        result.correctTop1
    ).length;


  const correctlyMatchedPositiveCases =
    positiveCases.filter(
      (result) =>
        result.correctTop1
    ).length;


  const noMatchCorrect =
    negativeCases.filter(
      (result) =>
        result.passed
    ).length;


  const falsePositiveMatches =
    negativeCases.filter(
      (result) =>
        result.actualStatus ===
        "matched"
    ).length;


  const falseAbstentions =
    positiveCases.filter(
      (result) =>
        result.actualStatus ===
        "no_confident_match"
    ).length;


  const overallCorrect =
    results.filter(
      (result) =>
        result.passed
    ).length;


  const top1Precision =
    matchedPredictions.length > 0
      ? top1Correct /
        matchedPredictions.length
      : null;


  const positiveRecall =
    positiveCases.length > 0
      ? correctlyMatchedPositiveCases /
        positiveCases.length
      : null;


  const noMatchAccuracy =
    negativeCases.length > 0
      ? noMatchCorrect /
        negativeCases.length
      : null;


  const overallAccuracy =
    results.length > 0
      ? overallCorrect /
        results.length
      : 0;


  const similarities =
    positiveCases
      .filter(
        (result) =>
          result.correctTop1
      )
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
        ) /
        similarities.length
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

    positiveCases:
      positiveCases.length,

    negativeCases:
      negativeCases.length,

    passedCases:
      overallCorrect,

    failedCases:
      results.length -
      overallCorrect,

    overallAccuracy:
      Number(
        overallAccuracy.toFixed(4)
      ),

    top1: {
      correct:
        top1Correct,

      predictedMatches:
        matchedPredictions.length,

      positiveCases:
        positiveCases.length,

      precision:
        top1Precision === null
          ? null
          : Number(
              top1Precision.toFixed(4)
            ),

      positiveRecall:
        positiveRecall === null
          ? null
          : Number(
              positiveRecall.toFixed(4)
            ),
    },

    noMatch: {
      correct:
        noMatchCorrect,

      total:
        negativeCases.length,

      accuracy:
        noMatchAccuracy === null
          ? null
          : Number(
              noMatchAccuracy.toFixed(4)
            ),
    },

    predictionCounts: {
      matched:
        matchedPredictions.length,

      abstained:
        abstainedPredictions.length,

      falsePositiveMatches,

      falseAbstentions,
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


  if (
    summary.top1.precision !==
    null
  ) {
    console.log(
      `Top-1 precision: ${(
        summary.top1.precision *
        100
      ).toFixed(2)}%`
    );
  } else {
    console.log(
      "Top-1 precision: N/A"
    );
  }


  if (
    summary.top1.positiveRecall !==
    null
  ) {
    console.log(
      `Positive-query recall: ${(
        summary.top1
          .positiveRecall *
        100
      ).toFixed(2)}%`
    );
  }


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
    `Matched predictions: ${summary.predictionCounts.matched}`
  );


  console.log(
    `Abstentions: ${summary.predictionCounts.abstained}`
  );


  console.log(
    `False-positive matches: ${summary.predictionCounts.falsePositiveMatches}`
  );


  console.log(
    `False abstentions: ${summary.predictionCounts.falseAbstentions}`
  );


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