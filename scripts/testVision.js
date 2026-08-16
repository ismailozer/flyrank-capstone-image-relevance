require("dotenv").config();

const pool = require("../src/db/pool");

const {
  getImageById,
} = require("../src/repositories/imageRepository");

const {
  analyzeImage,
} = require("../src/services/visionService");

async function run() {
  const imageId = Number(
    process.argv[2]
  );

  if (
    !Number.isInteger(imageId) ||
    imageId <= 0
  ) {
    throw new Error(
      "Usage: npm run vision:test -- <image-id>"
    );
  }

  const image =
    await getImageById(imageId);

  if (!image) {
    throw new Error(
      `Image ${imageId} does not exist.`
    );
  }

  console.log(
    `[vision-test] analyzing image ${image.id}: ${image.original_filename}`
  );

  console.log(
    `[vision-test] file: ${image.file_path}`
  );

  const startedAt = Date.now();

  const metadata =
    await analyzeImage({
      filePath: image.file_path,
      mimeType: image.mime_type,
    });

  const latencyMs =
    Date.now() - startedAt;

  console.log(
    "\n[vision-test] validated metadata:"
  );

  console.log(
    JSON.stringify(
      metadata,
      null,
      2
    )
  );

  console.log(
    `\n[vision-test] latency: ${latencyMs} ms`
  );
}

run()
  .catch((error) => {
    console.error(
      "\n[vision-test] failed:"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });