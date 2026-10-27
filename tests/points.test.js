import test from "node:test";
import assert from "node:assert/strict";
import { loadPoints } from "../points.js";
import { validateJournal } from "../domain.js";
test("points read failures do not fabricate a balance", async () => {
  await assert.rejects(
    loadPoints({ rpc: async () => ({ error: Error("offline") }) }),
    /기록 저장에는 영향/,
  );
  await assert.rejects(
    loadPoints({ rpc: async () => ({ data: { balance: -200 } }) }),
    /다시 확인/,
  );
  const summary = {
    balance: 1000,
    todayEarned: 1000,
    history: [],
    completedSlots: ["breakfast", "lunch", "dinner", "exercise", "weight"],
  };
  assert.deepEqual(
    await loadPoints({ rpc: async () => ({ data: summary }) }),
    summary,
  );
});
test("legacy backups gain an empty weights collection; weight photos and optional kg are validated", () => {
  const value = {
    records: [],
    exercises: [],
    evaluations: {},
    dayEvaluations: {},
    goals: { kcal: 2200 },
  };
  assert.deepEqual(validateJournal(structuredClone(value)).weights, []);
  const weight = {
    id: "weight-1",
    date: "2026-10-28",
    time: "",
    kg: null,
    photo: "data:image/png;base64,aGVsbG8=",
  };
  assert.equal(
    validateJournal({ ...value, weights: [weight] }).weights[0].kg,
    null,
  );
  assert.throws(() =>
    validateJournal({ ...value, weights: [{ ...weight, kg: -1 }] }),
  );
  assert.throws(() =>
    validateJournal({
      ...value,
      weights: [{ ...weight, photo: "javascript:alert(1)" }],
    }),
  );
});
