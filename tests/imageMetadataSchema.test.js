const test = require("node:test");
const assert = require("node:assert/strict");

const {
  imageMetadataSchema,
} = require("../src/schemas/imageMetadataSchema");


function createValidMetadata() {
  return {
    subject: "red fox",
    category: "animal",
    attributes: [
      "reddish-orange fur",
      "bushy tail",
      "pointed ears",
    ],
    caption:
      "A red fox standing in a snowy landscape.",
    confidence: 0.98,
  };
}


test(
  "valid image metadata passes schema validation",
  () => {
    const result =
      imageMetadataSchema.safeParse(
        createValidMetadata()
      );

    assert.equal(
      result.success,
      true
    );
  }
);


test(
  "metadata without subject is rejected",
  () => {
    const metadata =
      createValidMetadata();

    delete metadata.subject;

    const result =
      imageMetadataSchema.safeParse(
        metadata
      );

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "empty subject is rejected",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        subject: "",
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "attributes must be an array",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        attributes:
          "reddish-orange fur",
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "empty attributes array is rejected",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        attributes: [],
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "more than ten attributes are rejected",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        attributes: Array.from(
          { length: 11 },
          (_, index) =>
            `attribute-${index}`
        ),
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "confidence greater than 1 is rejected",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        confidence: 1.01,
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "confidence below 0 is rejected",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        confidence: -0.01,
      });

    assert.equal(
      result.success,
      false
    );
  }
);


test(
  "confidence boundary values 0 and 1 are accepted",
  () => {
    const zeroConfidence =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        confidence: 0,
      });

    const fullConfidence =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        confidence: 1,
      });

    assert.equal(
      zeroConfidence.success,
      true
    );

    assert.equal(
      fullConfidence.success,
      true
    );
  }
);


test(
  "caption longer than 500 characters is rejected",
  () => {
    const result =
      imageMetadataSchema.safeParse({
        ...createValidMetadata(),
        caption: "a".repeat(501),
      });

    assert.equal(
      result.success,
      false
    );
  }
);