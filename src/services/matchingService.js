const {
  getPostById,
} = require(
  "../repositories/postRepository"
);

const {
  getPostEmbedding,
  getCandidateImageEmbeddings,
} = require(
  "../repositories/embeddingRepository"
);

const {
  upsertSuggestion,
} = require(
  "../repositories/suggestionRepository"
);

const {
  cosineSimilarity,
} = require(
  "./similarityService"
);

const {
  evaluateCandidate,
} = require(
  "./mismatchGuardService"
);


async function rankImagesForPost(
  postId
) {
  const post =
    await getPostById(postId);

  if (!post) {
    throw new Error(
      `Post ${postId} does not exist.`
    );
  }

  const postEmbedding =
    await getPostEmbedding(
      postId
    );

  if (!postEmbedding) {
    throw new Error(
      `Post ${postId} has no embedding.`
    );
  }

  const candidates =
    await getCandidateImageEmbeddings(
      post.tenant_id
    );

  const knownSubjects =
    candidates.map(
      (candidate) =>
        candidate.subject
    );

  const similarityRanked =
    candidates
      .map((candidate) => {
        const similarity =
          cosineSimilarity(
            postEmbedding.embedding,
            candidate.embedding
          );

        return {
          ...candidate,

          similarity:
            Number(
              similarity.toFixed(6)
            ),
        };
      })
      .sort(
        (a, b) =>
          b.similarity -
          a.similarity
      );

  const evaluated = [];

  for (
    let index = 0;
    index <
    similarityRanked.length;
    index += 1
  ) {
    const candidate =
      similarityRanked[index];

    const rank =
      index + 1;

    const guard =
      evaluateCandidate({
        post,
        candidate,
        similarity:
          candidate.similarity,
        knownSubjects,
      });

    const suggestion =
      await upsertSuggestion({
        postId: post.id,

        imageId:
          candidate.image_id,

        rank,

        similarityScore:
          candidate.similarity,

        guardDecision:
          guard.decision,

        guardReason:
          guard.reason,
      });

    evaluated.push({
      suggestionId:
        suggestion.id,

      rank,

      imageId:
        candidate.image_id,

      filename:
        candidate.original_filename,

      subject:
        candidate.subject,

      category:
        candidate.category,

      attributes:
        candidate.attributes,

      caption:
        candidate.caption,

      confidence:
        Number(
          candidate.confidence
        ),

      similarity:
        candidate.similarity,

      decision:
        guard.decision,

      decisionCode:
        guard.code,

      reason:
        guard.reason,

      tagOverlap:
        guard.tagOverlap,
    });
  }

  const accepted =
    evaluated.filter(
      (candidate) =>
        candidate.decision ===
        "accepted"
    );

  return {
    post: {
      id: post.id,
      title: post.title,
    },

    status:
      accepted.length > 0
        ? "matched"
        : "no_confident_match",

    bestMatch:
      accepted[0] || null,

    candidates:
      evaluated,
  };
}


module.exports = {
  rankImagesForPost,
};