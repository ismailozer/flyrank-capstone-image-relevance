const evaluationCases = [
  {
    name: "red-fox-positive",

    title:
      "Behavior and Adaptation of Red Foxes",

    body:
      "Red foxes are wild canids recognized by their reddish-orange fur, pointed ears, bushy tails, and adaptable behavior in woodland and snowy habitats.",

    expectedOutcome: "match",

    expectedSubject:
      "red fox",
  },

  {
    name: "black-wolf-positive",

    title:
      "Black Wolves in Snowy Habitats",

    body:
      "Black wolves are wild canids that may live and hunt in cold snowy environments. They have dark fur, powerful bodies, and wolf-like facial features.",

    expectedOutcome: "match",

    expectedSubject:
      "black wolf",
  },

  {
    name: "labrador-positive",

    title:
      "Black Labrador Retrievers",

    body:
      "Black Labrador Retrievers are domestic dogs known for their black coats, floppy ears, friendly temperament, and playful behavior.",

    expectedOutcome: "match",

    expectedSubject:
      "black Labrador Retriever",
  },

  {
    name: "airplane-negative",

    title:
      "How Commercial Airplanes Generate Lift",

    body:
      "Commercial airplanes generate lift through aerodynamic forces acting on their wings. Air pressure, airflow, wing shape, and angle of attack contribute to aircraft flight.",

    expectedOutcome:
      "no_confident_match",

    expectedSubject: null,
  },
];

module.exports = {
  evaluationCases,
};