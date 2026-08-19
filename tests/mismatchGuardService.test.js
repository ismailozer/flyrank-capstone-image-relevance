const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateCandidate,
  detectExpectedSubjects,
  tokenize,
} = require(
  "../src/services/mismatchGuardService"
);


process.env.MATCH_SIMILARITY_THRESHOLD =
  "0.72";

process.env.MATCH_STRONG_SIMILARITY_THRESHOLD =
  "0.80";

process.env.VISION_CONFIDENCE_THRESHOLD =
  "0.80";


const foxPost = {
  title:
    "The Behavior of Red Foxes",

  body:
    "Red foxes are wild canids with reddish fur and bushy tails.",
};


const foxCandidate = {
  subject: "red fox",
  category: "animal",

  attributes: [
    "reddish-orange fur",
    "bushy tail",
  ],

  confidence: 0.98,
};


const wolfCandidate = {
  subject: "black wolf",
  category: "animal",

  attributes: [
    "dark fur",
    "snowy background",
  ],

  confidence: 0.95,
};


test(
  "plural foxes is normalized and detected as red fox",
  () => {
    const subjects =
      detectExpectedSubjects({
        post: foxPost,

        knownSubjects: [
          "red fox",
          "black wolf",
        ],
      });

    assert.deepEqual(
      subjects,
      ["red fox"]
    );
  }
);

test(
  "duplicate known subjects are deduplicated in mismatch reason",
  () => {
    const knownSubjects = [
      "red fox",
      "red fox",
      "red fox",
      "red fox",
      "black wolf",
    ];

    const subjects =
      detectExpectedSubjects({
        post: foxPost,
        knownSubjects,
      });

    assert.deepEqual(
      subjects,
      ["red fox"]
    );

    const result =
      evaluateCandidate({
        post: foxPost,

        candidate:
          wolfCandidate,

        similarity:
          0.764005,

        knownSubjects,
      });

    assert.equal(
      result.decision,
      "rejected"
    );

    assert.equal(
      result.code,
      "subject_mismatch"
    );

    assert.deepEqual(
      result.expectedSubjects,
      ["red fox"]
    );

    assert.equal(
      result.reason,
      'Subject mismatch: post explicitly targets "red fox", but the image subject is "black wolf".'
    );
  }
);


test(
  "correct fox candidate is accepted",
  () => {
    const result =
      evaluateCandidate({
        post: foxPost,

        candidate:
          foxCandidate,

        similarity:
          0.875515,

        knownSubjects: [
          "red fox",
          "black wolf",
        ],
      });

    assert.equal(
      result.decision,
      "accepted"
    );

    assert.equal(
      result.code,
      "accepted"
    );
  }
);


test(
  "wolf is rejected for explicit fox post even with high similarity",
  () => {
    const result =
      evaluateCandidate({
        post: foxPost,

        candidate:
          wolfCandidate,

        similarity:
          0.764005,

        knownSubjects: [
          "red fox",
          "black wolf",
        ],
      });

    assert.equal(
      result.decision,
      "rejected"
    );

    assert.equal(
      result.code,
      "subject_mismatch"
    );

    assert.match(
      result.reason,
      /black wolf/i
    );
  }
);


test(
  "low-confidence vision result is rejected",
  () => {
    const result =
      evaluateCandidate({
        post: foxPost,

        candidate: {
          ...foxCandidate,
          confidence: 0.65,
        },

        similarity:
          0.90,

        knownSubjects: [
          "red fox",
        ],
      });

    assert.equal(
      result.decision,
      "rejected"
    );

    assert.equal(
      result.code,
      "low_vision_confidence"
    );
  }
);


test(
  "candidate below semantic threshold is rejected",
  () => {
    const post = {
      title:
        "Aircraft Aerodynamics",

      body:
        "Airflow and wing lift in commercial airplanes.",
    };

    const result =
      evaluateCandidate({
        post,

        candidate:
          foxCandidate,

        similarity:
          0.65,

        knownSubjects: [
          "red fox",
          "black wolf",
        ],
      });

    assert.equal(
      result.decision,
      "rejected"
    );

    assert.equal(
      result.code,
      "low_similarity"
    );
  }
);


test(
  "tokenizer normalizes foxes to fox and wolves to wolf",
  () => {
    const tokens =
      tokenize(
        "Foxes and wolves"
      );

    assert.ok(
      tokens.includes("fox")
    );

    assert.ok(
      tokens.includes("wolf")
    );
  }
);