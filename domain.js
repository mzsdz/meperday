export function captureTime(tags) {
  // Read the original wall-clock EXIF string; do not convert timezone or use upload time.
  const text = tags?.DateTimeOriginal;
  if (typeof text !== "string") return "";
  const match = /^\d{4}:\d{2}:\d{2} ([01]\d|2[0-3]):([0-5]\d):[0-5]\d/.exec(
    text,
  );
  return match ? `${match[1]}:${match[2]}` : "";
}

export function calorieSummary(rows) {
  const known = rows.filter(
    (r) => typeof r.kcal === "number" && Number.isFinite(r.kcal),
  );
  return {
    value: known.length ? known.reduce((a, r) => a + r.kcal, 0) : null,
    partial: known.length < rows.length,
  };
}

export function recordedAverage(days) {
  const summaries = days.map(calorieSummary).filter((s) => s.value !== null);
  return summaries.length
    ? Math.round(summaries.reduce((n, s) => n + s.value, 0) / summaries.length)
    : null;
}

export function validateJournal(value) {
  if (
    !value ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.exercises) ||
    !value.goals ||
    !value.evaluations ||
    !value.dayEvaluations
  )
    throw Error("백업 구조를 확인해 주세요.");
  value.weights ??= [];
  if (!Array.isArray(value.weights))
    throw Error("몸무게 기록 형식을 확인해 주세요.");
  for (const row of value.weights)
    if (
      row.kg != null &&
      (typeof row.kg !== "number" ||
        !Number.isFinite(row.kg) ||
        row.kg <= 0 ||
        row.kg > 1000)
    )
      throw Error("몸무게 수치를 확인해 주세요.");
  for (const rows of [value.records, value.exercises, value.weights])
    for (const row of rows) {
      if (
        !row ||
        typeof row.id !== "string" ||
        !/^[a-zA-Z0-9-]+$/.test(row.id) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        typeof row.time !== "string"
      )
        throw Error("기록 형식이 올바르지 않습니다.");
      if (
        row.photo &&
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(row.photo)
      )
        throw Error("백업 사진 형식이 올바르지 않습니다.");
      delete row.photoPath;
    }
  for (const goal of Object.values(value.goals))
    if (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0)
      throw Error("기준량을 확인해 주세요.");
  return value;
}
