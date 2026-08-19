const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const manifest =
  require("../dataset/manifest.json");

const datasetDirectory =
  path.join(
    process.cwd(),
    "dataset",
    "demo"
  );


function calculateSha256(
  filePath
) {
  const buffer =
    fs.readFileSync(filePath);

  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}


function main() {
  const failures = [];

  for (const image of manifest.images) {
    const filePath =
      path.join(
        datasetDirectory,
        ...image.file.split("/")
      );

    if (!fs.existsSync(filePath)) {
      failures.push({
        file: image.file,
        problem: "missing_file",
      });

      continue;
    }

    const actualHash =
      calculateSha256(filePath);

    const expectedHash =
      String(
        image.sha256
      ).toLowerCase();

    if (
      actualHash !==
      expectedHash
    ) {
      failures.push({
        file: image.file,
        problem: "hash_mismatch",
        expectedHash,
        actualHash,
      });
    }
  }


  if (failures.length > 0) {
    console.error(
      `[verify] failed: ${failures.length} issue(s)`
    );

    console.table(failures);

    process.exitCode = 1;

    return;
  }


  console.log(
    `[verify] all ${manifest.images.length} manifest hashes match`
  );

  console.log(
    `[verify] unresolved source pages: ${
      manifest.images.filter(
        (image) => !image.sourcePage
      ).length
    }`
  );

  console.log(
    "[verify] dataset integrity verified"
  );
}


main();