const evaluationCases = [
  {
    name: "red-fox-positive",

    title:
      "Behavior and Adaptation of Red Foxes",

    body:
      "Red foxes are wild canids recognized by their reddish-orange fur, pointed ears, bushy tails, and adaptable behavior in woodland and snowy habitats.",

    expectedOutcome:
      "match",

    expectedSubject:
      "red fox",
  },

  {
    name:
      "red-fox-scientific-name-positive",

    title:
      "Behavior of Vulpes vulpes",

    body:
      "Vulpes vulpes is a highly adaptable wild canid with pointed ears, a bushy tail, reddish fur, and the ability to survive in woodland, grassland, and snowy environments.",

    expectedOutcome:
      "match",

    expectedSubject:
      "red fox",
  },

  {
    name:
      "red-fox-snow-habitat-positive",

    title:
      "Wild Canids in Snow-Covered Landscapes",

    body:
      "The red fox can remain active in snowy environments. Its reddish-orange coat, pointed ears, dark lower legs, and large bushy tail make it visually distinctive.",

    expectedOutcome:
      "match",

    expectedSubject:
      "red fox",
  },

  {
    name:
      "grey-wolf-positive",

    title:
      "Grey Wolves in Northern Habitats",

    body:
      "Grey wolves are wild canids with grey and brown fur, pointed ears, powerful bodies, and alert facial features. They can live in forests, grasslands, and cold northern environments.",

    expectedOutcome:
      "match",

    expectedSubject:
      "grey wolf",
  },

  {
    name:
      "golden-retriever-positive",

    title:
      "Golden Retrievers as Companion Dogs",

    body:
      "Golden Retrievers are domestic dogs recognized by their golden coats, floppy ears, friendly appearance, and active companion behavior.",

    expectedOutcome:
      "match",

    expectedSubject:
      "Golden Retriever",
  },

  {
    name:
      "airplane-negative",

    title:
      "How Commercial Airplanes Generate Lift",

    body:
      "Commercial airplanes generate lift through aerodynamic forces acting on their wings. Air pressure, airflow, wing shape, and angle of attack contribute to aircraft flight.",

    expectedOutcome:
      "no_confident_match",

    expectedSubject:
      null,
  },

  {
    name:
      "database-negative",

    title:
      "Improving PostgreSQL Query Performance",

    body:
      "Database performance can be improved through appropriate indexing, query planning, connection pooling, caching, and careful analysis of execution plans.",

    expectedOutcome:
      "no_confident_match",

    expectedSubject:
      null,
  },

  {
    name:
      "astronomy-negative",

    title:
      "Formation of Stars in Molecular Clouds",

    body:
      "Stars form when dense regions inside molecular clouds collapse under gravity. Temperature, pressure, mass, and gravitational forces influence the evolution of these stellar systems.",

    expectedOutcome:
      "no_confident_match",

    expectedSubject:
      null,
  },
];

module.exports = {
  evaluationCases,
};