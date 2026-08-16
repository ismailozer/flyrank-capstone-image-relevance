const express = require("express");
const { z } = require("zod");

const {
  getSuggestionById,
  createReview,
  getReviewsForSuggestion,
  getLatestReview,
} = require(
  "../repositories/reviewRepository"
);

const router = express.Router();


const suggestionIdSchema =
  z.coerce
    .number()
    .int()
    .positive();


const createReviewSchema =
  z.object({
    action: z.enum([
      "approved",
      "rejected",
    ]),

    notes: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional(),
  });


router.get(
  "/suggestions/:suggestionId",
  async (req, res, next) => {
    try {
      const parsed =
        suggestionIdSchema.safeParse(
          req.params.suggestionId
        );

      if (!parsed.success) {
        return res.status(400).json({
          error:
            "validation_error",

          message:
            "Suggestion id must be a positive integer.",
        });
      }

      const suggestion =
        await getSuggestionById(
          parsed.data
        );

      if (!suggestion) {
        return res.status(404).json({
          error:
            "suggestion_not_found",
        });
      }

      const reviews =
        await getReviewsForSuggestion(
          parsed.data
        );

      const latestReview =
        reviews[0] || null;

      return res.json({
        suggestion,
        latestReview,
        reviews,
      });
    } catch (error) {
      next(error);
    }
  }
);


router.post(
  "/suggestions/:suggestionId",
  async (req, res, next) => {
    try {
      const suggestionResult =
        suggestionIdSchema.safeParse(
          req.params.suggestionId
        );

      if (
        !suggestionResult.success
      ) {
        return res.status(400).json({
          error:
            "validation_error",

          message:
            "Suggestion id must be a positive integer.",
        });
      }

      const bodyResult =
        createReviewSchema.safeParse(
          req.body
        );

      if (!bodyResult.success) {
        return res.status(400).json({
          error:
            "validation_error",

          details:
            bodyResult.error.flatten(),
        });
      }

      const suggestion =
        await getSuggestionById(
          suggestionResult.data
        );

      if (!suggestion) {
        return res.status(404).json({
          error:
            "suggestion_not_found",
        });
      }

      const review =
        await createReview({
          suggestionId:
            suggestionResult.data,

          action:
            bodyResult.data.action,

          notes:
            bodyResult.data.notes ??
            null,
        });

      return res.status(201).json({
        review,

        suggestion: {
          id:
            suggestion.id,

          postId:
            suggestion.post_id,

          imageId:
            suggestion.image_id,

          automaticDecision:
            suggestion.guard_decision,

          automaticReason:
            suggestion.guard_reason,

          similarity:
            Number(
              suggestion.similarity_score
            ),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);


router.get(
  "/suggestions/:suggestionId/latest",
  async (req, res, next) => {
    try {
      const parsed =
        suggestionIdSchema.safeParse(
          req.params.suggestionId
        );

      if (!parsed.success) {
        return res.status(400).json({
          error:
            "validation_error",
        });
      }

      const suggestion =
        await getSuggestionById(
          parsed.data
        );

      if (!suggestion) {
        return res.status(404).json({
          error:
            "suggestion_not_found",
        });
      }

      const review =
        await getLatestReview(
          parsed.data
        );

      return res.json({
        suggestionId:
          parsed.data,

        review,
      });
    } catch (error) {
      next(error);
    }
  }
);


module.exports = router;