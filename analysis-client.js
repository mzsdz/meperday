import { cloud } from "./cloud.js";
export async function analyzePhoto(kind, image) {
  if (!cloud) throw Error("로그인 후 AI 분석을 사용할 수 있어요.");
  const { data, error } = await cloud.auth.getSession();
  if (error || !data.session)
    throw Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
  const result = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ kind, image }),
    signal: AbortSignal.timeout(40000),
  });
  const value = await result.json().catch(() => ({}));
  if (!result.ok)
    throw Error(
      value.error ||
        "AI 분석을 완료하지 못했어요. 수동 기록은 계속 사용할 수 있어요.",
    );
  return value;
}
