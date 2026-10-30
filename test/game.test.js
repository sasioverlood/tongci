import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRound, normalizeWord } from "../game.js";

test("normalizeWord ignores spaces and letter case", () => {
  assert.equal(normalizeWord(" Same Word "), "sameword");
});

test("evaluateRound wins when all players submit the same word", () => {
  assert.deepEqual(
    evaluateRound([{ word: "天空" }, { word: " 天 空 " }]),
    { won: true, word: "天空" },
  );
});

test("evaluateRound continues when words differ", () => {
  assert.deepEqual(
    evaluateRound([{ word: "海洋" }, { word: "天空" }]),
    { won: false, word: null },
  );
});

test("evaluateRound requires every player to submit", () => {
  assert.deepEqual(
    evaluateRound([{ word: "风" }, { word: "" }]),
    { won: false, word: null },
  );
});
