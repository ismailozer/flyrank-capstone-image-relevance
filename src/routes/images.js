const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { z } = require("zod");

const {
  ingestImage,
} = require("../services/imageIngestionService");

const {
  getImageById,
} = require("../repositories/imageRepository");

const router = express.Router();

const uploadDirectory = path.join(
  process.cwd(),
  "uploads"
);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const randomName = crypto.randomUUID();

    callback(
      null,
      `${randomName}${extension}`
    );
  },
});

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage,

  limits: {
    fileSize: 8 * 1024 * 1024,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new Error(
          "Only JPEG, PNG and WebP images are supported."
        )
      );
    }

    callback(null, true);
  },
});

const tenantSchema = z.coerce
  .number()
  .int()
  .positive();

router.post(
  "/",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const tenantResult =
        tenantSchema.safeParse(
          req.body.tenant_id
        );

      if (!tenantResult.success) {
        return res.status(400).json({
          error: "validation_error",
          message:
            "tenant_id must be a positive integer.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "validation_error",
          message:
            "An image file is required.",
        });
      }

      const result = await ingestImage({
        tenantId: tenantResult.data,
        file: req.file,
      });

      return res
        .status(result.duplicate ? 200 : 201)
        .json({
          image: result.image,
          duplicate: result.duplicate,
        });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/:id", async (req, res, next) => {
  try {
    const imageId =
      z.coerce.number().int().positive().safeParse(
        req.params.id
      );

    if (!imageId.success) {
      return res.status(400).json({
        error: "validation_error",
        message:
          "Image id must be a positive integer.",
      });
    }

    const image = await getImageById(
      imageId.data
    );

    if (!image) {
      return res.status(404).json({
        error: "image_not_found",
        message:
          "The requested image does not exist.",
      });
    }

    return res.status(200).json({
      image,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;