export async function loadPoints(client) {
  const { data, error } = await client.rpc("meday_points_summary");
  if (error)
    throw Error(
      "포인트 내역을 불러오지 못했어요. 기록 저장에는 영향이 없어요.",
      { cause: error },
    );
  if (
    !data ||
    !Number.isSafeInteger(data.balance) ||
    data.balance < 0 ||
    !Number.isSafeInteger(data.todayEarned) ||
    data.todayEarned < 0 ||
    data.todayEarned > 1000 ||
    !Array.isArray(data.history) ||
    !Array.isArray(data.completedSlots)
  )
    throw Error("포인트 내역을 다시 확인해 주세요.");
  return data;
}
