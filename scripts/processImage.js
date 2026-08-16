require("dotenv").config();

const pool = require("../src/db/pool");

const {
  processImage,
} = require("../src/services/imageProcessingService");

async function run() {
  const imageId = Number(
    process.argv[2]
  );

  if (
    !Number.isInteger(imageId) ||
    imageId <= 0
  ) {
    throw new Error(
      "Usage: npm run image:process -- <image-id>"
    );
  }

  console.log(
    `[image-processing] processing image ${imageId}`
  );

  const startedAt = Date.now();

  const result = await processImage(
    imageId
  );

  const latencyMs =
    Date.now() - startedAt;

  console.log(
    "\n[image-processing] completed"
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  console.log(
    `\n[image-processing] total latency: ${latencyMs} ms`
  );
}

run()
  .catch((error) => {
    console.error(
      "\n[image-processing] failed:"
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });