const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const SOURCE_IMAGE =
  path.join(
    process.cwd(),
    "dataset",
    "demo",
    "foxes",
    "pexels-brettjordan-9639881.jpg"
  );

const OUTPUT_DIRECTORY =
  path.join(
    process.cwd(),
    "dataset",
    "ambiguous-candidates"
  );


async function ensureSourceExists() {
  try {
    await fs.access(
      SOURCE_IMAGE
    );
  } catch {
    throw new Error(
      `Source image does not exist: ${SOURCE_IMAGE}`
    );
  }
}


async function createCandidate({
  filename,
  width,
  height,
  blur,
  grayscale = false,
}) {
  const outputPath =
    path.join(
      OUTPUT_DIRECTORY,
      filename
    );

  let pipeline =
    sharp(SOURCE_IMAGE)
      .resize(
        width,
        height,
        {
          fit: "cover",
          position: "centre",
        }
      )
      .blur(blur)
      .resize(
        512,
        512,
        {
          fit: "fill",
          kernel:
            sharp.kernel.nearest,
        }
      );

  if (grayscale) {
    pipeline =
      pipeline.grayscale();
  }

  await pipeline
    .jpeg({
      quality: 75,
    })
    .toFile(
      outputPath
    );

  console.log(
    `[ambiguous] created ${filename}`
  );

  return outputPath;
}


async function main() {
  await ensureSourceExists();

  await fs.rm(
    OUTPUT_DIRECTORY,
    {
      recursive: true,
      force: true,
    }
  );

  await fs.mkdir(
    OUTPUT_DIRECTORY,
    {
      recursive: true,
    }
  );

  const candidates = [
    {
      filename:
        "candidate-01.jpg",
      width: 128,
      height: 128,
      blur: 3,
    },

    {
      filename:
        "candidate-02.jpg",
      width: 96,
      height: 96,
      blur: 5,
    },

    {
      filename:
        "candidate-03.jpg",
      width: 64,
      height: 64,
      blur: 7,
    },

    {
      filename:
        "candidate-04.jpg",
      width: 48,
      height: 48,
      blur: 9,
    },

    {
      filename:
        "candidate-05.jpg",
      width: 32,
      height: 32,
      blur: 11,
    },

    {
      filename:
        "candidate-06.jpg",
      width: 32,
      height: 32,
      blur: 12,
      grayscale: true,
    },
  ];

  console.log(
    "[ambiguous] source:"
  );

  console.log(
    SOURCE_IMAGE
  );

  console.log("");

  for (
    const candidate
    of candidates
  ) {
    await createCandidate(
      candidate
    );
  }

  console.log("");
  console.log(
    `[ambiguous] generated ${candidates.length} candidates`
  );

  console.log(
    `[ambiguous] output: ${OUTPUT_DIRECTORY}`
  );
}


main().catch(
  (error) => {
    console.error(
      "[ambiguous] failed"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);