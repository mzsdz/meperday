import test from "node:test";
import assert from "node:assert/strict";
import { createJournalStore } from "../cloud.js";

function fakeClient() {
  let saved = null,
    uploads = 0,
    fail = false;
  const client = {
    storage: {
      from: () => ({
        upload: async () => {
          uploads++;
          return { error: null };
        },
        createSignedUrl: async (path) => ({
          data: { signedUrl: `https://example.test/${path}` },
          error: null,
        }),
      }),
    },
    from: () => {
      let op = "read",
        values,
        expected;
      const q = {
        select: () => q,
        eq: (k, v) => {
          if (k === "revision") expected = v;
          return q;
        },
        maybeSingle: async () => ({
          data: structuredClone(saved),
          error: null,
        }),
        insert: (v) => {
          op = "insert";
          values = v;
          return q;
        },
        update: (v) => {
          op = "update";
          values = v;
          return q;
        },
        single: async () => {
          if (
            fail ||
            (op === "insert" && saved) ||
            (op === "update" && expected !== saved?.revision)
          )
            return { data: null, error: { message: "conflict" } };
          saved = { ...saved, ...structuredClone(values) };
          return { data: { revision: saved.revision }, error: null };
        },
      };
      return q;
    },
  };
  return {
    client,
    get uploads() {
      return uploads;
    },
    get saved() {
      return saved;
    },
    setFail: (v) => (fail = v),
  };
}
const journal = () => ({
  records: [
    {
      id: "meal",
      date: "2026-10-27",
      time: "",
      meal: "breakfast",
      kcal: null,
      nutrients: {},
      photo: "data:image/jpeg;base64,/9j/2Q==",
    },
  ],
  exercises: [],
  evaluations: {},
  dayEvaluations: {},
  goals: { kcal: 2200 },
});

test("photo-only save uploads private photo, stores path, restores after new session", async () => {
  const f = fakeClient(),
    a = createJournalStore(f.client, "user-a");
  assert.equal(await a.load(), null);
  await a.save(journal());
  assert.equal(f.uploads, 1);
  assert.equal(f.saved.payload.records[0].photo, undefined);
  assert.match(f.saved.payload.records[0].photoPath, /^user-a\//);
  const b = createJournalStore(f.client, "user-a");
  const loaded = await b.load();
  assert.equal(loaded.records[0].time, "");
  assert.equal(loaded.records[0].kcal, null);
  assert.match(loaded.records[0].photo, /^https:/);
  await b.save(loaded);
  assert.equal(f.uploads, 1);
});
test("concurrent writer is rejected and database failures do not report success", async () => {
  const f = fakeClient(),
    a = createJournalStore(f.client, "user-a"),
    b = createJournalStore(f.client, "user-a");
  await a.load();
  await a.save(journal());
  await b.load();
  await a.save(journal());
  await assert.rejects(b.save(journal()), /서버 저장 실패/);
  f.setFail(true);
  await assert.rejects(a.save(journal()), /서버 저장 실패/);
});
