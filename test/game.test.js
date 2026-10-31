import test from "node:test";
import assert from "node:assert/strict";
import { canStartNextRound, evaluateRound, normalizeWord } from "../game.js";

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

test("next round starts only after every player is ready", () => {
  assert.equal(canStartNextRound([{ readyNext: true }, { readyNext: false }]), false);
  assert.equal(canStartNextRound([{ readyNext: true }, { readyNext: true }]), true);
});

test("replay also requires every player to confirm", () => {
  const players = [{ readyNext: true }, { readyNext: false }, { readyNext: true }];
  assert.equal(canStartNextRound(players), false);
  players[1].readyNext = true;
  assert.equal(canStartNextRound(players), true);
});
