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
  cosineSimilarity,
} = require("./similarityService");


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

  const ranked =
    candidates
      .map((candidate) => {
        const similarity =
          cosineSimilarity(
            postEmbedding.embedding,
            candidate.embedding
          );

        return {
          imageId:
            candidate.image_id,

          filename:
            candidate.original_filename,

          subject:
            candidate.subject,

          category:
            candidate.category,

          caption:
            candidate.caption,

          confidence:
            candidate.confidence,

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
      )
      .map(
        (candidate, index) => ({
          rank: index + 1,
          ...candidate,
        })
      );

  return {
    post: {
      id: post.id,
      title: post.title,
    },

    candidates: ranked,
  };
}

module.exports = {
  rankImagesForPost,
};