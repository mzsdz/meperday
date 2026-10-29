// Adult reference estimate, not a prescription. Mifflin et al. AJCN 1990.
// https://pubmed.ncbi.nlm.nih.gov/2305711/
export const ACTIVITIES = [
  ["low", "주로 앉아서 생활", 1.2], ["light", "가벼운 활동", 1.375],
  ["moderate", "규칙적인 활동", 1.55], ["high", "활동량이 많은 생활", 1.725],
];
export function energyReference(profile = {}) {
  if (profile.mode === "none") return null;
  if (profile.mode === "manual" && Number.isFinite(profile.manualKcal) && profile.manualKcal > 0 && profile.manualKcal <= 10000)
    return { resting: null, daily: Math.round(profile.manualKcal), label: "직접 설정한 하루 기준" };
  const { age, sex, heightCm, weightKg } = profile;
  if (![age, heightCm, weightKg].every(Number.isFinite) || age < 19 || age > 120 || heightCm < 100 || heightCm > 250 || weightKg < 20 || weightKg > 500 || !["male", "female"].includes(sex)) return null;
  const resting = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161));
  if (resting <= 0) return null;
  const factor = ACTIVITIES.find(a => a[0] === profile.activity)?.[2];
  return { resting, daily: factor ? Math.round(resting * factor) : null, label: "하루 유지 소비량 추정" };
}
export function timeline(journal, date) {
  const rows = [
    ...journal.records.filter(r => r.date === date).map(r => ({kind:"food", record:r})),
    ...journal.exercises.filter(r => r.date === date).map(r => ({kind:"exercise", record:r})),
    ...(journal.weights || []).filter(r => r.date === date).map(r => ({kind:"weight", record:r})),
    ...(journal.captures || []).filter(r => r.date === date && !r.recordKind).map(r => ({kind:"capture", record:r})),
  ];
  return rows.sort((a,b) => (a.record.time || "99:99").localeCompare(b.record.time || "99:99"));
}
