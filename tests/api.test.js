import test from "node:test";
import assert from "node:assert/strict";
import { createAnalysisHandler } from "../api/analyze.js";
const image = "data:image/png;base64,aGVsbG8=";
const env = {
  AI_GATEWAY_API_KEY: "test-only",
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "test-only",
};
function response() {
  return {
    code: 0,
    body: null,
    setHeader() {},
    status(v) {
      this.code = v;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
  };
}
const request = (extra = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer user-token" },
  body: { kind: "food", image },
  ...extra,
});
const client =
  (quotaError = null, authError = null) =>
  () => ({
    auth: {
      getUser: async () => ({
        data: { user: authError ? null : { id: "user" } },
        error: authError,
      }),
    },
    rpc: async () => ({ data: 19, error: quotaError }),
  });
const result = {
  name: "음식 추정",
  kcal: 300,
  nutrients: Object.fromEntries(
    [
      "carb",
      "protein",
      "fat",
      "fiber",
      "calcium",
      "iron",
      "vitD",
      "vitC",
      "potassium",
      "sodium",
      "satFat",
    ].map((k) => [k, null]),
  ),
  notes: "불확실한 영양소는 비워 둠",
};
test("unconfigured AI returns 503 without fabricated results", async () => {
  const res = response();
  await createAnalysisHandler({ env: {} })(request(), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.nutrients, undefined);
});
test("status GET has no secrets and methods are restricted", async () => {
  let res = response();
  await createAnalysisHandler({ env })({ method: "GET" }, res);
  assert.deepEqual(res.body, { configured: true, requiresLogin: true });
  res = response();
  await createAnalysisHandler({ env })({ method: "DELETE" }, res);
  assert.equal(res.code, 405);
});
test("unauthenticated and expired sessions cannot call model", async () => {
  const generate = () => {
    throw Error("model must not run");
  };
  let res = response();
  await createAnalysisHandler({ env, generate })(request({ headers: {} }), res);
  assert.equal(res.code, 401);
  res = response();
  await createAnalysisHandler({
    env,
    generate,
    clientFactory: client(null, Error("expired")),
  })(request(), res);
  assert.equal(res.code, 401);
});
test("daily quota prevents model calls", async () => {
  const res = response();
  await createAnalysisHandler({
    env,
    clientFactory: client({ message: "analysis_daily_limit" }),
    generate: () => {
      throw Error("model must not run");
    },
  })(request(), res);
  assert.equal(res.code, 429);
});
test("valid estimates preserve unknown nutrients and schema validation rejects invalid output", async () => {
  let res = response();
  await createAnalysisHandler({
    env,
    clientFactory: client(),
    generate: async () => ({ output: result }),
  })(request(), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.nutrients.iron, null);
  assert.equal(res.body.source, "AI 추정");
  res = response();
  await createAnalysisHandler({
    env,
    clientFactory: client(),
    generate: async () => ({ output: { ...result, kcal: -12 } }),
  })(request(), res);
  assert.equal(res.code, 502);
  assert.equal(res.body.kcal, undefined);
});
test("unsafe image input rejected before provider call and billing errors remain explicit failures", async () => {
  let res = response();
  await createAnalysisHandler({ env })(
    request({
      body: { kind: "food", image: "https://untrusted.invalid/photo" },
    }),
    res,
  );
  assert.equal(res.code, 400);
  res = response();
  await createAnalysisHandler({
    env,
    clientFactory: client(),
    generate: async () => {
      throw Object.assign(Error("billing"), { statusCode: 402 });
    },
  })(request(), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.nutrients, undefined);
});
