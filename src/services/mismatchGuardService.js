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

const TAG_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "from",
  "by",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
]);


// Words that must never be used to infer an explicit subject.
//
// Example:
// "black and white line drawing of an animal head"
//
// should not match an unrelated post merely because the post
// contains words such as "and", "of", or "animal".
const SUBJECT_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "from",
  "with",
  "without",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",

  // Generic visual-description terms.
  // These do not represent a specific semantic subject.
  "image",
  "photo",
  "photograph",
  "picture",
  "drawing",
  "line",
  "sketch",
  "illustration",
  "figure",
  "scene",

  // Very broad object/category descriptions.
  // They are too weak to infer that a post explicitly targets
  // a particular image subject.
  "animal",
  "object",
  "subject",
  "head",
]);

const {
  SUBJECT_ALIASES,
} = require(
  "../config/subjectAliases"
);


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
      !SUBJECT_MODIFIERS.has(token) &&
      !SUBJECT_STOP_WORDS.has(token)
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

function normalizePhrase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicateSubjects(
  subjects
) {
  const uniqueSubjects =
    new Map();

  for (const subject of subjects) {
    const normalized =
      normalizePhrase(subject);

    if (
      normalized &&
      !uniqueSubjects.has(
        normalized
      )
    ) {
      uniqueSubjects.set(
        normalized,
        subject
      );
    }
  }

  return [
    ...uniqueSubjects.values(),
  ];
}


function findAliasSubjects({
  text,
  knownSubjects,
}) {
  const normalizedText =
    ` ${normalizePhrase(text)} `;

  const matches = [];

  for (
    const {
      alias,
      canonical,
    } of SUBJECT_ALIASES
  ) {
    const normalizedAlias =
      normalizePhrase(alias);

    if (
      !normalizedText.includes(
        ` ${normalizedAlias} `
      )
    ) {
      continue;
    }

    const canonicalTokens =
      getMeaningfulSubjectTokens(
        canonical
      );

    const matchingKnownSubjects =
      knownSubjects.filter(
        (subject) => {
          const subjectTokens =
            getMeaningfulSubjectTokens(
              subject
            );

          return canonicalTokens.every(
            (token) =>
              subjectTokens.includes(
                token
              )
          );
        }
      );

    matches.push(
      ...matchingKnownSubjects
    );
  }

  return [...new Set(matches)];
}

function detectExpectedSubjects({
  post,
  knownSubjects,
}) {
  const uniqueKnownSubjects =
    deduplicateSubjects(
      knownSubjects
    );

  const titleAliasMatches =
    findAliasSubjects({
      text: post.title,
      knownSubjects:
        uniqueKnownSubjects,
    });

  if (
    titleAliasMatches.length > 0
  ) {
    return deduplicateSubjects(
      titleAliasMatches
    );
  }

  const titleTokens =
    tokenize(post.title);

  const titleMatches =
    uniqueKnownSubjects.filter(
      (subject) =>
        subjectIsMentioned(
          subject,
          titleTokens
        )
    );

  if (
    titleMatches.length > 0
  ) {
    return deduplicateSubjects(
      titleMatches
    );
  }

  const bodyAliasMatches =
    findAliasSubjects({
      text: post.body,
      knownSubjects:
        uniqueKnownSubjects,
    });

  if (
    bodyAliasMatches.length > 0
  ) {
    return deduplicateSubjects(
      bodyAliasMatches
    );
  }

  const bodyTokens =
    tokenize(post.body);

  const bodyMatches =
    uniqueKnownSubjects.filter(
      (subject) =>
        subjectIsMentioned(
          subject,
          bodyTokens
        )
    );

  return deduplicateSubjects(
    bodyMatches
  );
}


function calculateTagOverlap({
  post,
  candidate,
}) {
  const postTokens = new Set(
    tokenize(
      `${post.title} ${post.body}`
    ).filter(
      (token) =>
        !TAG_STOP_WORDS.has(token)
    )
  );

  const candidateText = [
    candidate.subject,
    candidate.category,
    ...(candidate.attributes || []),
  ].join(" ");

  const candidateTokens =
    tokenize(candidateText).filter(
      (token) =>
        !TAG_STOP_WORDS.has(token)
    );

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
      0.80
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


  // Guard 1:
  // reject unreliable vision classifications.
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


  // Guard 2:
  // if the post explicitly targets a known subject,
  // the image must contain that subject.
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


  // Guard 3:
  // reject candidates below the normal semantic threshold.
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


  // Guard 4:
  // If there is no explicitly identified subject and no
  // lexical/tag evidence, demand stronger semantic similarity.
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