const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATASET_DIRECTORY =
  path.join(
    process.cwd(),
    "dataset",
    "demo"
  );

const OUTPUT_PATH =
  path.join(
    process.cwd(),
    "dataset",
    "manifest.json"
  );

const AMBIGUOUS_SOURCE =
  "foxes/pexels-brettjordan-9639881.jpg";

const SUPPORTED_EXTENSIONS =
  new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ]);


async function walkDirectory(
  directory
) {
  const entries =
    await fs.readdir(
      directory,
      {
        withFileTypes: true,
      }
    );

  const files = [];

  for (const entry of entries) {
    const fullPath =
      path.join(
        directory,
        entry.name
      );

    if (entry.isDirectory()) {
      const nested =
        await walkDirectory(
          fullPath
        );

      files.push(
        ...nested
      );

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension =
      path
        .extname(entry.name)
        .toLowerCase();

    if (
      SUPPORTED_EXTENSIONS.has(
        extension
      )
    ) {
      files.push(fullPath);
    }
  }

  return files;
}


async function sha256(
  filePath
) {
  const buffer =
    await fs.readFile(
      filePath
    );

  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}


function getCategory(
  relativePath
) {
  if (
    relativePath ===
    "ambiguous.jpg"
  ) {
    return "ambiguous";
  }

  const folder =
    relativePath.split("/")[0];

  const categories = {
    bears: "bear",
    deer: "deer",
    dogs: "dog",
    foxes: "red_fox",
    wolves: "wolf",
  };

  return (
    categories[folder] ||
    folder
  );
}


function extractPexelsPhotoId(
  filename
) {
  if (
    !filename.startsWith(
      "pexels-"
    )
  ) {
    return null;
  }

  const match =
    filename.match(
      /-(\d+)\.[^.]+$/i
    );

  return (
    match
      ? match[1]
      : null
  );
}


async function main() {
  const files =
    await walkDirectory(
      DATASET_DIRECTORY
    );

  files.sort();

  const images = [];

  for (const filePath of files) {
    const relativePath =
      path
        .relative(
          DATASET_DIRECTORY,
          filePath
        )
        .replace(/\\/g, "/");

    const filename =
      path.basename(
        filePath
      );

    const stats =
      await fs.stat(
        filePath
      );

    const fileHash =
      await sha256(
        filePath
      );

    if (
      relativePath ===
      "ambiguous.jpg"
    ) {
      images.push({
        file:
          relativePath,

        category:
          "ambiguous",

        provenanceType:
          "derived",

        source:
          "Pexels",

        sourceAsset:
          AMBIGUOUS_SOURCE,

        sourcePhotoId:
          "9639881",

        sourcePage:
          null,

        transformation: {
          purpose:
            "Deterministic low-confidence vision acceptance case",

          operations: [
            "resize source to 32x32 using cover/centre",
            "apply blur radius 11",
            "resize to 512x512 using nearest-neighbor",
            "encode as JPEG quality 75",
          ],

          generator:
            "scripts/generateAmbiguousCandidates.js",

          selectedCandidate:
            "candidate-05.jpg",
        },

        validation: {
          observedSubject:
            "red fox",

          observedConfidence:
            0.55,

          confidenceThreshold:
            0.8,

          expectedProcessingStatus:
            "review_required",

          automaticEmbeddingExpected:
            false,
        },

        sizeBytes:
          stats.size,

        sha256:
          fileHash,
      });

      continue;
    }

    images.push({
      file:
        relativePath,

      category:
        getCategory(
          relativePath
        ),

      provenanceType:
        "original",

      source:
        "Pexels",

      sourcePhotoId:
        extractPexelsPhotoId(
          filename
        ),

      sourcePage:
        null,

      originalFilename:
        filename,

      sizeBytes:
        stats.size,

      sha256:
        fileHash,
    });
  }

  const categories = {};

  for (const image of images) {
    categories[
      image.category
    ] =
      (
        categories[
          image.category
        ] || 0
      ) + 1;
  }

  const totalSizeBytes =
    images.reduce(
      (
        sum,
        image
      ) =>
        sum +
        image.sizeBytes,
      0
    );

  const unresolvedSourcePages =
    images.filter(
      (image) =>
        image.sourcePage ===
        null
    ).length;

  const manifest = {
    manifestVersion: 1,

    corpus: {
      name:
        "FlyRank Image Relevance Demo Corpus",

      imageCount:
        images.length,

      totalSizeBytes,

      categories,
    },

    storage: {
      rawCorpusCommitted:
        false,

      reason:
        "The local image corpus is approximately 128 MB, so raw images are intentionally excluded from Git.",

      manifestCommitted:
        true,
    },

    provenance: {
      primarySource:
        "Pexels",

      sourcePageVerification:
        "pending",

      unresolvedSourcePages,

      note:
        "Pexels photo IDs were extracted from the original downloaded filenames. Source page URLs are intentionally left null until individually verified; URLs are never guessed.",
    },

    images,
  };

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      manifest,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `[manifest] wrote ${images.length} image records`
  );

  console.log(
    "[manifest] categories:"
  );

  console.log(categories);

  console.log(
    `[manifest] total size: ${(totalSizeBytes / 1024 / 1024).toFixed(
      2
    )} MB`
  );

  console.log(
    `[manifest] unresolved source pages: ${unresolvedSourcePages}`
  );

  const ambiguous =
    images.find(
      (image) =>
        image.file ===
        "ambiguous.jpg"
    );

  console.log(
    "[manifest] ambiguous SHA-256:",
    ambiguous?.sha256
  );
}


main().catch(
  (error) => {
    console.error(
      "[manifest] failed"
    );

    console.error(error);

    process.exit(1);
  }
);