const express = require("express");
const { z } = require("zod");

const {
  createImageProcessingJob,
  getJobById,
} = require("../repositories/backgroundJobRepository");

const router = express.Router();

const createJobSchema = z.object({
  tenant_id: z.coerce
    .number()
    .int()
    .positive(),

  image_ids: z
    .array(
      z.coerce.number().int().positive()
    )
    .min(1)
    .max(100),
});

router.post(
  "/image-processing",
  async (req, res, next) => {
    try {
      const validation =
        createJobSchema.safeParse(
          req.body
        );

      if (!validation.success) {
        return res.status(400).json({
          error: "validation_error",
          details:
            validation.error.flatten(),
        });
      }

      const {
        tenant_id,
        image_ids,
      } = validation.data;

      const headerKey =
        req.get("Idempotency-Key");

      const idempotencyKey =
        headerKey
          ? `image-processing:${tenant_id}:${headerKey}`
          : null;

      const result =
        await createImageProcessingJob({
          tenantId: tenant_id,
          imageIds: [
            ...new Set(image_ids),
          ],
          idempotencyKey,
        });

      return res
        .status(
          result.duplicate
            ? 200
            : 202
        )
        .json({
          job_id: result.job.id,
          status: result.job.status,
          duplicate:
            result.duplicate,
          status_url:
            `/jobs/${result.job.id}`,
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
      const result = z.coerce
        .number()
        .int()
        .positive()
        .safeParse(req.params.id);

      if (!result.success) {
        return res.status(400).json({
          error:
            "validation_error",
          message:
            "Job id must be a positive integer.",
        });
      }

      const job =
        await getJobById(
          result.data
        );

      if (!job) {
        return res.status(404).json({
          error:
            "job_not_found",
        });
      }

      return res.json({
        job,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;