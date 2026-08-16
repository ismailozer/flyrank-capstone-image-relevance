require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { z } = require("zod");

const {
  imageMetadataSchema,
} = require("../schemas/imageMetadataSchema");

const IMAGE_ANALYSIS_PROMPT = `
You are the image-understanding component of a content matching system.

Analyze only what is visibly present in the supplied image.

Return structured metadata describing the primary subject of the image.

Requirements:

- subject: the most specific primary subject visible in the image
- category: a broader semantic category such as animal, food, nature, technology, person, vehicle, architecture, or object
- attributes: 2 to 8 concise visually grounded attributes
- caption: one factual sentence describing the image
- confidence: a number from 0 to 1 representing confidence in the identification

Do not infer facts that cannot be reasonably determined from the image.

If the subject is ambiguous, lower the confidence instead of guessing.
`.trim();

async function analyzeImage({
  filePath,
  mimeType,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Image file does not exist: ${absolutePath}`
    );
  }

  const base64Image = fs.readFileSync(
    absolutePath,
    {
      encoding: "base64",
    }
  );

  const { GoogleGenAI } = await import(
    "@google/genai"
  );

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const interaction =
    await client.interactions.create({
      model:
        process.env.VISION_MODEL ||
        "gemini-3.6-flash",

      input: [
        {
          type: "text",
          text: IMAGE_ANALYSIS_PROMPT,
        },
        {
          type: "image",
          data: base64Image,
          mime_type: mimeType,
        },
      ],

      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: z.toJSONSchema(
          imageMetadataSchema
        ),
      },

      store: false,
    });

  if (!interaction.output_text) {
    throw new Error(
      "Vision model returned an empty response."
    );
  }

  let parsedOutput;

  try {
    parsedOutput = JSON.parse(
      interaction.output_text
    );
  } catch {
    throw new Error(
      "Vision model returned invalid JSON."
    );
  }

  return imageMetadataSchema.parse(
    parsedOutput
  );
}

module.exports = {
  analyzeImage,
};