const test = require("node:test");
const assert = require(
  "node:assert/strict"
);

const request = require(
  "supertest"
);

const app = require(
  "../src/app"
);


// Deliberately use a very large valid
// integer that should not exist in the
// reproducible demo database.
const NON_EXISTENT_ID =
  2147483647;


test(
  "missing image upload returns 400",
  async () => {
    const response =
      await request(app)
        .post("/images")
        .field("tenant_id", "1");

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );

    assert.equal(
      response.body.message,
      "An image file is required."
    );
  }
);


test(
  "invalid image tenant id returns 400",
  async () => {
    const response =
      await request(app)
        .post("/images")
        .field(
          "tenant_id",
          "invalid"
        );

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );

    assert.equal(
      response.body.message,
      "tenant_id must be a positive integer."
    );
  }
);


test(
  "unsupported image MIME type returns 415",
  async () => {
    const response =
      await request(app)
        .post("/images")
        .field("tenant_id", "1")
        .attach(
          "image",
          Buffer.from(
            "not-an-image"
          ),
          {
            filename:
              "invalid.txt",

            contentType:
              "text/plain",
          }
        );

    assert.equal(
      response.status,
      415
    );

    assert.equal(
      response.body.error,
      "unsupported_media_type"
    );
  }
);


test(
  "oversized image returns 413",
  async () => {
    const oversizedImage =
      Buffer.alloc(
        8 * 1024 * 1024 + 1
      );

    const response =
      await request(app)
        .post("/images")
        .field("tenant_id", "1")
        .attach(
          "image",
          oversizedImage,
          {
            filename:
              "oversized.png",

            contentType:
              "image/png",
          }
        );

    assert.equal(
      response.status,
      413
    );

    assert.equal(
      response.body.error,
      "image_too_large"
    );
  }
);


test(
  "unexpected upload field returns 400",
  async () => {
    const response =
      await request(app)
        .post("/images")
        .field("tenant_id", "1")
        .attach(
          "wrong_field",
          Buffer.from("test"),
          {
            filename:
              "test.png",

            contentType:
              "image/png",
          }
        );

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "unexpected_file_field"
    );
  }
);


test(
  "malformed JSON returns 400 instead of 500",
  async () => {
    const response =
      await request(app)
        .post("/posts")
        .set(
          "Content-Type",
          "application/json"
        )
        .send(
          '{"tenant_id":1,"title":'
        );

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "invalid_json"
    );
  }
);


test(
  "invalid post body returns 400",
  async () => {
    const response =
      await request(app)
        .post("/posts")
        .send({
          tenant_id: 1,
          title: "",
          body: "",
        });

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );
  }
);


test(
  "invalid image-processing job body returns 400",
  async () => {
    const response =
      await request(app)
        .post(
          "/jobs/image-processing"
        )
        .send({
          tenant_id: -1,
          image_ids: [],
        });

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );
  }
);


test(
  "invalid job id returns 400",
  async () => {
    const response =
      await request(app)
        .get("/jobs/not-a-number");

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );
  }
);


test(
  "invalid image id returns 400",
  async () => {
    const response =
      await request(app)
        .get(
          "/images/not-a-number"
        );

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );
  }
);


test(
  "invalid post id returns 400",
  async () => {
    const response =
      await request(app)
        .get(
          "/posts/not-a-number"
        );

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      response.body.error,
      "validation_error"
    );
  }
);


// ==================================================
// Clean 404 regression tests
// ==================================================

test(
  "nonexistent image returns clean 404",
  async () => {
    const response =
      await request(app)
        .get(
          `/images/${NON_EXISTENT_ID}`
        );

    assert.equal(
      response.status,
      404
    );

    assert.equal(
      response.body.error,
      "image_not_found"
    );

    assert.equal(
      response.body.message,
      "The requested image does not exist."
    );
  }
);


test(
  "nonexistent job returns clean 404",
  async () => {
    const response =
      await request(app)
        .get(
          `/jobs/${NON_EXISTENT_ID}`
        );

    assert.equal(
      response.status,
      404
    );

    assert.equal(
      response.body.error,
      "job_not_found"
    );
  }
);


test(
  "nonexistent post returns clean 404",
  async () => {
    const response =
      await request(app)
        .get(
          `/posts/${NON_EXISTENT_ID}`
        );

    assert.equal(
      response.status,
      404
    );

    assert.equal(
      response.body.error,
      "post_not_found"
    );
  }
);


test(
  "matching images for nonexistent post returns clean 404",
  async () => {
    const response =
      await request(app)
        .get(
          `/posts/${NON_EXISTENT_ID}/images`
        );

    assert.equal(
      response.status,
      404
    );

    assert.equal(
      response.body.error,
      "post_not_found"
    );
  }
);


test(
  "evaluating image for nonexistent post returns clean 404",
  async () => {
    const response =
      await request(app)
        .get(
          `/posts/${NON_EXISTENT_ID}/images/1/evaluate`
        );

    assert.equal(
      response.status,
      404
    );

    assert.equal(
      response.body.error,
      "post_not_found"
    );
  }
);


test(
  "unknown endpoint returns clean 404",
  async () => {
    const response =
      await request(app)
        .get(
          "/this-endpoint-does-not-exist"
        );

    assert.equal(
      response.status,
      404
    );

    assert.equal(
      response.body.error,
      "not_found"
    );
  }
);