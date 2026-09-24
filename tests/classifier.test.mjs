import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModel, toxicProbability } from "../extension/classifier.js";

const model = {
  bias: 0,
  threshold: 0.7,
  word: {
    ngram: [1, 1],
    sublinear: false,
    vocab: { қазақ: [1, 2] },
  },
  char: {
    ngram: [2, 2],
    sublinear: false,
    vocab: {},
  },
};

await loadModel(`data:application/json,${encodeURIComponent(JSON.stringify(model))}`);

test("слова, совпадающие с полями прототипа, не ломают вероятность", () => {
  for (const text of ["__proto__", "constructor", "toString"]) {
    assert.equal(toxicProbability(text), 0.5);
  }
});

test("кириллическое слово учитывается моделью", () => {
  assert.ok(toxicProbability("қазақ") > 0.5);
});
