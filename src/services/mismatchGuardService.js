const SUBJECT_MODIFIERS = new Set([
  "red",
  "black",
  "white",
  "gray",
  "grey",
  "brown",
  "golden",
  "orange",
  "yellow",
  "young",
  "adult",
  "male",
  "female",
  "wild",
  "domestic",
  "common",
]);


function normalizeWord(word) {
  let normalized = word
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

  if (!normalized) {
    return "";
  }

  if (
    normalized.endsWith("ves") &&
    normalized.length > 4
  ) {
    normalized =
      normalized.slice(0, -3) + "f";
  } else if (
    /(xes|ses|zes|ches|shes)$/.test(
      normalized
    )
  ) {
    normalized =
      normalized.slice(0, -2);
  } else if (
    normalized.endsWith("ies") &&
    normalized.length > 4
  ) {
    normalized =
      normalized.slice(0, -3) + "y";
  } else if (
    normalized.endsWith("s") &&
    !normalized.endsWith("ss") &&
    normalized.length > 3
  ) {
    normalized =
      normalized.slice(0, -1);
  }

  return normalized;
}


function tokenize(text) {
  if (!text) {
    return [];
  }

  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .map(normalizeWord)
        .filter(Boolean)
    ),
  ];
}


function getMeaningfulSubjectTokens(
  subject
) {
  return tokenize(subject).filter(
    (token) =>
      !SUBJECT_MODIFIERS.has(token)
  );
}


function subjectIsMentioned(
  subject,
  textTokens
) {
  const subjectTokens =
    getMeaningfulSubjectTokens(
      subject
    );

  if (subjectTokens.length === 0) {
    return false;
  }

  return subjectTokens.some(
    (token) =>
      textTokens.includes(token)
  );
}


function detectExpectedSubjects({
  post,
  knownSubjects,
}) {
  const titleTokens =
    tokenize(post.title);

  const bodyTokens =
    tokenize(post.body);

  const titleMatches =
    knownSubjects.filter(
      (subject) =>
        subjectIsMentioned(
          subject,
          titleTokens
        )
    );

  if (titleMatches.length > 0) {
    return titleMatches;
  }

  return knownSubjects.filter(
    (subject) =>
      subjectIsMentioned(
        subject,
        bodyTokens
      )
  );
}


function calculateTagOverlap({
  post,
  candidate,
}) {
  const postTokens = new Set(
    tokenize(
      `${post.title} ${post.body}`
    )
  );

  const candidateText = [
    candidate.subject,
    candidate.category,
    ...(candidate.attributes || []),
  ].join(" ");

  const candidateTokens =
    tokenize(candidateText);

  const overlapping =
    candidateTokens.filter(
      (token) =>
        postTokens.has(token)
    );

  return {
    count: overlapping.length,
    tokens: [
      ...new Set(overlapping),
    ],
  };
}


function getThreshold(
  environmentName,
  fallback
) {
  const value = Number(
    process.env[
      environmentName
    ] ?? fallback
  );

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `${environmentName} must be between 0 and 1.`
    );
  }

  return value;
}


function evaluateCandidate({
  post,
  candidate,
  similarity,
  knownSubjects,
}) {
  const similarityThreshold =
    getThreshold(
      "MATCH_SIMILARITY_THRESHOLD",
      0.72
    );

  const strongSimilarityThreshold =
    getThreshold(
      "MATCH_STRONG_SIMILARITY_THRESHOLD",
      0.8
    );

  const confidenceThreshold =
    getThreshold(
      "VISION_CONFIDENCE_THRESHOLD",
      0.75
    );

  const expectedSubjects =
    detectExpectedSubjects({
      post,
      knownSubjects,
    });

  const tagOverlap =
    calculateTagOverlap({
      post,
      candidate,
    });

  if (
    Number(candidate.confidence) <
    confidenceThreshold
  ) {
    return {
      decision: "rejected",

      reason:
        `Low vision confidence: ` +
        `${candidate.confidence} is below ` +
        `${confidenceThreshold}.`,

      code:
        "low_vision_confidence",

      expectedSubjects,
      tagOverlap,
    };
  }

  if (expectedSubjects.length > 0) {
    const candidateMatchesExpected =
      expectedSubjects.some(
        (expectedSubject) => {
          const expectedTokens =
            getMeaningfulSubjectTokens(
              expectedSubject
            );

          const candidateTokens =
            getMeaningfulSubjectTokens(
              candidate.subject
            );

          return expectedTokens.some(
            (token) =>
              candidateTokens.includes(
                token
              )
          );
        }
      );

    if (!candidateMatchesExpected) {
      return {
        decision: "rejected",

        code:
          "subject_mismatch",

        reason:
          `Subject mismatch: post explicitly targets ` +
          `"${expectedSubjects.join(
            ", "
          )}", but the image subject is ` +
          `"${candidate.subject}".`,

        expectedSubjects,
        tagOverlap,
      };
    }
  }

  if (
    similarity <
    similarityThreshold
  ) {
    return {
      decision: "rejected",

      code:
        "low_similarity",

      reason:
        `Semantic similarity ${similarity.toFixed(
          6
        )} is below the configured threshold ` +
        `${similarityThreshold}.`,

      expectedSubjects,
      tagOverlap,
    };
  }

  if (
    expectedSubjects.length === 0 &&
    tagOverlap.count === 0 &&
    similarity <
      strongSimilarityThreshold
  ) {
    return {
      decision: "rejected",

      code:
        "weak_semantic_support",

      reason:
        `No explicit subject or tag agreement was found, ` +
        `and similarity ${similarity.toFixed(
          6
        )} is below the stronger fallback threshold ` +
        `${strongSimilarityThreshold}.`,

      expectedSubjects,
      tagOverlap,
    };
  }

  return {
    decision: "accepted",

    code: "accepted",

    reason:
      `Candidate passed subject consistency, ` +
      `vision confidence, and semantic similarity checks.`,

    expectedSubjects,
    tagOverlap,
  };
}


module.exports = {
  evaluateCandidate,
  detectExpectedSubjects,
  tokenize,
};