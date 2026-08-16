require("dotenv").config();

const pool =
  require("../src/db/pool");

const {
  generateImageEmbedding,
} = require(
  "../src/services/imageEmbeddingService"
);

async function run() {
  const imageId = Number(
    process.argv[2]
  );

  if (
    !Number.isInteger(imageId) ||
    imageId <= 0
  ) {
    throw new Error(
      "Usage: npm run image:embed -- <image-id>"
    );
  }

  console.log(
    `[embedding] generating image embedding for ${imageId}`
  );

  const result =
    await generateImageEmbedding(
      imageId
    );

  console.log(
    "\n[embedding] completed"
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error(
      "\n[embedding] failed:"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });