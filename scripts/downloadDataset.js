require("dotenv").config();

const fs =
  require("fs/promises");

const path =
  require("path");

const crypto =
  require("crypto");

const sharp =
  require("sharp");


const MANIFEST_PATH =
  path.join(
    process.cwd(),
    "dataset",
    "manifest.json"
  );

const DATASET_DIRECTORY =
  path.join(
    process.cwd(),
    "dataset",
    "demo"
  );

const PEXELS_API_BASE_URL =
  "https://api.pexels.com/v1";


function requireApiKey() {
  const apiKey =
    process.env.PEXELS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "PEXELS_API_KEY is required. " +
      "Add it to your local .env file."
    );
  }

  return apiKey;
}


async function calculateSha256(
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


async function refreshFileIntegrity(
  image,
  filePath
) {
  const stats =
    await fs.stat(
      filePath
    );

  image.sizeBytes =
    stats.size;

  image.sha256 =
    await calculateSha256(
      filePath
    );
}


async function fetchPexelsPhoto(
  photoId,
  apiKey
) {
  const response =
    await fetch(
      `${PEXELS_API_BASE_URL}/photos/${photoId}`,
      {
        headers: {
          Authorization:
            apiKey,
        },
      }
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `Pexels photo ${photoId} request failed ` +
      `with HTTP ${response.status}: ${body}`
    );
  }

  return response.json();
}


async function downloadFile(
  url,
  destination
) {
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Download failed with HTTP ${response.status}: ${url}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  await fs.mkdir(
    path.dirname(
      destination
    ),
    {
      recursive: true,
    }
  );

  await fs.writeFile(
    destination,
    Buffer.from(
      arrayBuffer
    )
  );
}


async function generateAmbiguousImage(
  sourcePath,
  destination
) {
  await sharp(sourcePath)
    .resize(
      32,
      32,
      {
        fit:
          "cover",

        position:
          "centre",
      }
    )
    .blur(11)
    .resize(
      512,
      512,
      {
        fit:
          "fill",

        kernel:
          sharp.kernel.nearest,
      }
    )
    .jpeg({
      quality: 75,
    })
    .toFile(
      destination
    );
}


async function readManifest() {
  const raw =
    await fs.readFile(
      MANIFEST_PATH,
      "utf8"
    );

  return JSON.parse(raw);
}


async function writeManifest(
  manifest
) {
  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      manifest,
      null,
      2
    ) + "\n",
    "utf8"
  );
}


async function main() {
  const apiKey =
    requireApiKey();

  const manifest =
    await readManifest();

  const originalImages =
    manifest.images.filter(
      (image) =>
        image.provenanceType ===
        "original"
    );

  console.log(
    `[dataset] original Pexels images: ${originalImages.length}`
  );

  const photoCache =
    new Map();


  for (
    const image
    of originalImages
  ) {
    const photoId =
      String(
        image.sourcePhotoId
      );

    let photo =
      photoCache.get(
        photoId
      );

    if (!photo) {
      console.log(
        `[dataset] fetching Pexels metadata: ${photoId}`
      );

      photo =
        await fetchPexelsPhoto(
          photoId,
          apiKey
        );

      photoCache.set(
        photoId,
        photo
      );
    }

    const downloadUrl =
      photo.src.original;

    const destination =
      path.join(
        DATASET_DIRECTORY,
        image.file
      );

    console.log(
      `[dataset] downloading ${image.file}`
    );

    await downloadFile(
      downloadUrl,
      destination
    );

    image.sourcePage =
      photo.url;

    image.photographer =
      photo.photographer;

    image.photographerUrl =
      photo.photographer_url;

    image.pexelsWidth =
      photo.width;

    image.pexelsHeight =
      photo.height;

    image.downloadSource =
      "pexels_api_src_original";

    await refreshFileIntegrity(
      image,
      destination
    );
  }


  const ambiguous =
    manifest.images.find(
      (image) =>
        image.file ===
        "ambiguous.jpg"
    );

  if (!ambiguous) {
    throw new Error(
      "ambiguous.jpg is missing from the manifest."
    );
  }


  const ambiguousSourcePath =
    path.join(
      DATASET_DIRECTORY,
      ambiguous.sourceAsset
    );

  const ambiguousDestination =
    path.join(
      DATASET_DIRECTORY,
      "ambiguous.jpg"
    );

  console.log(
    "[dataset] generating ambiguous.jpg"
  );

  await generateAmbiguousImage(
    ambiguousSourcePath,
    ambiguousDestination
  );


  const sourcePhoto =
    photoCache.get(
      String(
        ambiguous.sourcePhotoId
      )
    );

  if (sourcePhoto) {
    ambiguous.sourcePage =
      sourcePhoto.url;

    ambiguous.photographer =
      sourcePhoto.photographer;

    ambiguous.photographerUrl =
      sourcePhoto.photographer_url;

    ambiguous.pexelsWidth =
      sourcePhoto.width;

    ambiguous.pexelsHeight =
      sourcePhoto.height;
  }

  await refreshFileIntegrity(
    ambiguous,
    ambiguousDestination
  );


  manifest.corpus.totalSizeBytes =
    manifest.images.reduce(
      (
        total,
        image
      ) =>
        total +
        Number(
          image.sizeBytes || 0
        ),
      0
    );

  manifest.corpus.imageCount =
    manifest.images.length;


  manifest.provenance.sourcePageVerification =
    "verified_via_pexels_api";

  manifest.provenance.unresolvedSourcePages =
    manifest.images.filter(
      (image) =>
        !image.sourcePage
    ).length;

  manifest.provenance.integrity =
    "SHA-256 values reflect the files produced by the latest successful dataset download/reconstruction run.";


  await writeManifest(
    manifest
  );


  console.log("");

  console.log(
    `[dataset] corpus ready: ${manifest.images.length} images`
  );

  console.log(
    `[dataset] unresolved source pages: ${manifest.provenance.unresolvedSourcePages}`
  );

  console.log(
    `[dataset] total size: ${(manifest.corpus.totalSizeBytes / 1024 / 1024).toFixed(
      2
    )} MB`
  );

  console.log(
    `[dataset] directory: ${DATASET_DIRECTORY}`
  );
}


main().catch(
  (error) => {
    console.error(
      "[dataset] failed"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);