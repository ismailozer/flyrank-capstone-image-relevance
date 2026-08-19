require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const pool = require("../src/db/pool");

const {
  findTenantByName,
  createTenant,
} = require("../src/repositories/tenantRepository");

const {
  ingestImage,
} = require("../src/services/imageIngestionService");

const {
  createPost,
} = require("../src/repositories/postRepository");

const {
  getPostEmbedding,
} = require("../src/repositories/embeddingRepository");

const {
  generatePostEmbedding,
} = require("../src/services/postEmbeddingService");


function getMimeType(filename) {
  const extension =
    path.extname(filename).toLowerCase();

  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  return mimeTypes[extension] || null;
}


async function getImageFilesRecursive(
  directory,
  rootDirectory = directory
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
      const nestedFiles =
        await getImageFilesRecursive(
          fullPath,
          rootDirectory
        );

      files.push(
        ...nestedFiles
      );

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const mimeType =
      getMimeType(entry.name);

    if (!mimeType) {
      continue;
    }

    const relativePath =
      path
        .relative(
          rootDirectory,
          fullPath
        )
        .replace(/\\/g, "/");

    files.push({
      filename:
        entry.name,

      fullPath,

      relativePath,

      mimeType,
    });
  }

  return files.sort(
    (a, b) =>
      a.relativePath.localeCompare(
        b.relativePath
      )
  );
}


async function seedTenant() {
  const tenantName =
    "FlyRank Demo";

  let tenant =
    await findTenantByName(
      tenantName
    );

  if (tenant) {
    console.log(
      "[seed] demo tenant already exists"
    );

    return tenant;
  }

  tenant =
    await createTenant({
      name:
        tenantName,

      aiBudgetUsd:
        1,
    });

  console.log(
    "[seed] demo tenant created"
  );

  return tenant;
}


async function seedImages(
  tenantId
) {
  const datasetDirectory =
    path.join(
      process.cwd(),
      "dataset",
      "demo"
    );

  const uploadDirectory =
    path.join(
      process.cwd(),
      "uploads"
    );

  await fs.mkdir(
    uploadDirectory,
    {
      recursive: true,
    }
  );

  try {
    await fs.access(
      datasetDirectory
    );
  } catch {
    throw new Error(
      "dataset/demo does not exist."
    );
  }

  const imageFiles =
    await getImageFilesRecursive(
      datasetDirectory
    );

  if (
    imageFiles.length === 0
  ) {
    throw new Error(
      "dataset/demo contains no supported images."
    );
  }

  console.log(
    `[seed] discovered ${imageFiles.length} supported image(s)`
  );

  const seededImages = [];

  for (
    const imageFile
    of imageFiles
  ) {
    const extension =
      path
        .extname(
          imageFile.filename
        )
        .toLowerCase();

    const temporaryUploadPath =
      path.join(
        uploadDirectory,
        `${randomUUID()}${extension}`
      );

    await fs.copyFile(
      imageFile.fullPath,
      temporaryUploadPath
    );

    const result =
      await ingestImage({
        tenantId,

        file: {
          path:
            temporaryUploadPath,

          originalname:
            imageFile.filename,

          mimetype:
            imageFile.mimeType,
        },
      });

    console.log(
      `[seed] image ${
        result.duplicate
          ? "reused"
          : "created"
      }: ${imageFile.relativePath} -> ${result.image.id}`
    );

    seededImages.push(
      result.image
    );
  }

  console.log(
    `[seed] corpus images ready: ${seededImages.length}`
  );

  return seededImages;
}


async function findPostByTitle(
  tenantId,
  title
) {
  const result =
    await pool.query(
      `
        SELECT
          id,
          tenant_id,
          title,
          body,
          created_at,
          updated_at
        FROM posts
        WHERE tenant_id = $1
          AND title = $2
        LIMIT 1
      `,
      [
        tenantId,
        title,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


async function seedPost({
  tenantId,
  title,
  body,
}) {
  let post =
    await findPostByTitle(
      tenantId,
      title
    );

  if (!post) {
    post =
      await createPost({
        tenantId,
        title,
        body,
      });

    console.log(
      `[seed] post created: ${title}`
    );
  } else {
    console.log(
      `[seed] post reused: ${title}`
    );
  }

  const existingEmbedding =
    await getPostEmbedding(
      post.id
    );

  if (!existingEmbedding) {
    console.log(
      `[seed] generating embedding for post ${post.id}`
    );

    await generatePostEmbedding(
      post.id
    );
  } else {
    console.log(
      `[seed] post embedding already exists: ${post.id}`
    );
  }

  return post;
}


async function seed() {
  try {
    const tenant =
      await seedTenant();

    const images =
      await seedImages(
        tenant.id
      );

    const foxPost =
      await seedPost({
        tenantId:
          tenant.id,

        title:
          "The Behavior of Red Foxes",

        body:
          "Red foxes are intelligent wild canids known for their reddish-orange fur, bushy tails, pointed ears, and adaptable behavior in woodland and snowy environments.",
      });

    const airplanePost =
      await seedPost({
        tenantId:
          tenant.id,

        title:
          "How Commercial Airplanes Generate Lift",

        body:
          "Commercial airplanes generate lift through aerodynamic forces acting on their wings. Wing shape, air pressure, airflow, and angle of attack all contribute to keeping an aircraft in flight.",
      });

    console.log(
      "\n[seed] demo corpus ready"
    );

    console.log({
      tenant_id:
        tenant.id,

      image_count:
        images.length,

      image_ids:
        images.map(
          (image) =>
            Number(image.id)
        ),

      fox_post_id:
        Number(
          foxPost.id
        ),

      airplane_post_id:
        Number(
          airplanePost.id
        ),
    });
  } finally {
    await pool.end();
  }
}


seed().catch(
  (error) => {
    console.error(
      "[seed] failed"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);