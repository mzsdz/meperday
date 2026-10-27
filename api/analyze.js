// Vercel serverless endpoint. Images are transmitted only after the user presses "AI 분석".
// Required server-side environment: OPENAI_API_KEY, MVP_ACCESS_CODE.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST 요청만 허용합니다." });
  const key = process.env.OPENAI_API_KEY;
  const access = process.env.MVP_ACCESS_CODE;
  if (!key || !access)
    return res
      .status(503)
      .json({
        error:
          "사진 AI 분석이 아직 연결되지 않았습니다. 사진과 수치를 직접 저장할 수 있어요.",
      });
  if (req.headers["x-meday-code"] !== access)
    return res
      .status(403)
      .json({ error: "설정에서 올바른 AI 접근 코드를 입력해주세요." });
  const { kind, image } = req.body || {};
  if (
    !["food", "exercise"].includes(kind) ||
    typeof image !== "string" ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ||
    image.length > 4_000_000
  )
    return res
      .status(400)
      .json({ error: "지원하지 않는 이미지 형식이거나 사진이 너무 큽니다." });
  const food = `Return only a JSON object. Analyze a Korean meal photograph. Respond in Korean. Identify foods visible, estimate the consumed portion and calories as one meal. All nutrition estimates should be conservative and realistic; if an individual micronutrient cannot be estimated reliably, write null, NEVER pretend it is zero. Output: {"name":string,"kcal":number,"nutrients":{"carb":number|null,"protein":number|null,"fat":number|null,"fiber":number|null,"calcium":number|null,"iron":number|null,"vitD":number|null,"vitC":number|null,"potassium":number|null,"sodium":number|null,"satFat":number|null},"notes":string}. kcal must refer to the estimated quantity in the image. Do not make up food brand, store, purchase location, price, or a precise cooking recipe. Do not assume every visible item was eaten by the user. This is a rough visual estimate, not verified nutritional data.`;
  const exercise = `Return only a JSON object in Korean. Extract fields from the fitness app screenshot if legible: {"type":string,"minutes":number|null,"calories":number|null,"notes":string}. type can be generic if activity recognizable; do not invent values when absent or illegible. Calories refers to workout energy only, not food.`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 24000);
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 850,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You extract structured food or activity information faithfully. Never include content outside the JSON object.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: kind === "food" ? food : exercise },
                { type: "image_url", image_url: { url: image, detail: "low" } },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return res
        .status(502)
        .json({
          error:
            "AI 서버 응답을 확인할 수 없습니다. 직접 기록은 계속 사용할 수 있어요.",
        });
    const text = result.choices?.[0]?.message?.content;
    const parsed = JSON.parse(text || "{}");
    if (kind === "food") {
      const allowed = [
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
      ];
      const nutrients = Object.fromEntries(
        allowed.map((id) => {
          let n = parsed.nutrients?.[id];
          return [
            id,
            typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 100000
              ? n
              : null,
          ];
        }),
      );
      return res
        .status(200)
        .json({
          name: String(parsed.name || "음식 (추정)").slice(0, 90),
          kcal:
            typeof parsed.kcal === "number"
              ? Math.max(0, Math.min(9000, Math.round(parsed.kcal)))
              : null,
          nutrients,
          notes: String(parsed.notes || "").slice(0, 250),
          source: "AI 추정",
        });
    }
    return res
      .status(200)
      .json({
        type: String(parsed.type || "운동").slice(0, 75),
        minutes:
          typeof parsed.minutes === "number"
            ? Math.max(0, Math.round(parsed.minutes))
            : null,
        calories:
          typeof parsed.calories === "number"
            ? Math.max(0, Math.round(parsed.calories))
            : null,
        notes: String(parsed.notes || "").slice(0, 250),
      });
  } catch (error) {
    return res
      .status(502)
      .json({
        error:
          "AI 분석이 일시적으로 작동하지 않아요. 직접 입력으로 기록할 수 있어요.",
      });
  }
}
