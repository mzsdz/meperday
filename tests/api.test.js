import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/analyze.js";

function response() {
  return {
    code: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
test("unconfigured AI returns 503 without fabricated analysis", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const res = response();
    await handler({ method: "POST", headers: {}, body: { kind: "food" } }, res);
    assert.equal(res.code, 503);
    assert.ok(res.body.error);
    assert.equal(res.body.nutrients, undefined);
  } finally {
    if (previous) process.env.OPENAI_API_KEY = previous;
  }
});
test("AI endpoint rejects non-POST requests", async () => {
  const res = response();
  await handler({ method: "GET" }, res);
  assert.equal(res.code, 405);
});
