const express = require("express");
const { z } = require("zod");

const {
  createPost,
  getPostById,
} = require(
  "../repositories/postRepository"
);

const {
  generatePostEmbedding,
} = require(
  "../services/postEmbeddingService"
);

const {
  rankImagesForPost,
} = require(
  "../services/matchingService"
);

const router = express.Router();


const createPostSchema =
  z.object({
    tenant_id: z.coerce
      .number()
      .int()
      .positive(),

    title: z
      .string()
      .trim()
      .min(1)
      .max(300),

    body: z
      .string()
      .trim()
      .min(1)
      .max(20000),
  });


router.post(
  "/",
  async (req, res, next) => {
    try {
      const validation =
        createPostSchema.safeParse(
          req.body
        );

      if (!validation.success) {
        return res
          .status(400)
          .json({
            error:
              "validation_error",

            details:
              validation.error.flatten(),
          });
      }

      const data =
        validation.data;

      const post =
        await createPost({
          tenantId:
            data.tenant_id,

          title:
            data.title,

          body:
            data.body,
        });

      const embedding =
        await generatePostEmbedding(
          post.id
        );

      return res
        .status(201)
        .json({
          post,
          embedding,
        });
    } catch (error) {
      next(error);
    }
  }
);


router.get(
  "/:id",
  async (req, res, next) => {
    try {
      const parsed =
        z.coerce
          .number()
          .int()
          .positive()
          .safeParse(
            req.params.id
          );

      if (!parsed.success) {
        return res.status(400).json({
          error:
            "validation_error",
        });
      }

      const post =
        await getPostById(
          parsed.data
        );

      if (!post) {
        return res.status(404).json({
          error:
            "post_not_found",
        });
      }

      return res.json({
        post,
      });
    } catch (error) {
      next(error);
    }
  }
);


router.get(
  "/:id/images",
  async (req, res, next) => {
    try {
      const parsed =
        z.coerce
          .number()
          .int()
          .positive()
          .safeParse(
            req.params.id
          );

      if (!parsed.success) {
        return res.status(400).json({
          error:
            "validation_error",
        });
      }

      const result =
        await rankImagesForPost(
          parsed.data
        );

      return res.json(
        result
      );
    } catch (error) {
      next(error);
    }
  }
);


module.exports = router;