const { z } = require("zod");

const imageMetadataSchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(200),

  category: z
    .string()
    .min(1)
    .max(100),

  attributes: z
    .array(
      z.string().min(1).max(100)
    )
    .min(1)
    .max(10),

  caption: z
    .string()
    .min(1)
    .max(500),

  confidence: z
    .number()
    .min(0)
    .max(1),
});

module.exports = {
  imageMetadataSchema,
};