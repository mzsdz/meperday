import test from "node:test";
import assert from "node:assert/strict";
import {
  captureTime,
  calorieSummary,
  recordedAverage,
  validateJournal,
} from "../domain.js";

test("EXIF original time is kept as wall clock, absent tags stay empty", () => {
  assert.equal(
    captureTime({ DateTimeOriginal: "2026:10:27 08:09:10" }),
    "08:09",
  );
  for (const tags of [
    null,
    {},
    { DateTimeOriginal: "2026:10:27 28:09:10" },
    { DateTimeOriginal: new Date() },
  ])
    assert.equal(captureTime(tags), "");
});
test("unknown calories are excluded from average rather than treated as zero", () => {
  assert.deepEqual(calorieSummary([{ kcal: null }]), {
    value: null,
    partial: true,
  });
  assert.equal(recordedAverage([[{ kcal: null }], [{ kcal: 400 }], []]), 400);
  assert.equal(recordedAverage([[{ kcal: 0 }], [{ kcal: 400 }]]), 200);
  assert.deepEqual(calorieSummary([{ kcal: 300 }, { kcal: null }]), {
    value: 300,
    partial: true,
  });
});
test("backup rejects executable photo URLs and unsafe IDs", () => {
  const data = {
    records: [
      { id: "ok", date: "2026-10-27", time: "", photo: "javascript:alert(1)" },
    ],
    exercises: [],
    goals: { kcal: 2200 },
    evaluations: {},
    dayEvaluations: {},
  };
  assert.throws(() => validateJournal(data));
  data.records[0].photo = null;
  data.records[0].id = '" onmouseover="alert(1)';
  assert.throws(() => validateJournal(data));
});
