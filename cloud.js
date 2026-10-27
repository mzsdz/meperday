import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
export const loginLinkError = new URLSearchParams(
  globalThis.location?.hash?.slice(1) || "",
).get("error_code");
export const cloud = url && key ? createClient(url, key) : null;
const BUCKET = "meday-photos";

export function createJournalStore(client, userId) {
  let revision = null;
  return {
    async load() {
      const { data, error } = await client
        .from("meday_journals")
        .select("payload,revision")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      revision = data?.revision ?? null;
      if (!data) return null;
      const payload = structuredClone(data.payload);
      for (const row of [...payload.records, ...payload.exercises]) {
        if (!row.photoPath) continue;
        const result = await client.storage
          .from(BUCKET)
          .createSignedUrl(row.photoPath, 3600);
        if (result.error) throw result.error;
        row.photo = result.data.signedUrl;
      }
      return payload;
    },
    async save(value) {
      const payload = structuredClone(value);
      for (const row of [...payload.records, ...payload.exercises]) {
        if (row.photo?.startsWith("data:")) {
          const blob = await (await fetch(row.photo)).blob();
          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
            ),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
          const path = `${userId}/${hash}.jpg`;
          const uploaded = await client.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
          if (
            uploaded.error &&
            !["409", "Duplicate"].includes(String(uploaded.error.statusCode)) &&
            uploaded.error.error !== "Duplicate"
          )
            throw uploaded.error;
          row.photoPath = path;
        }
        delete row.photo;
      }
      const next = (revision ?? 0) + 1;
      let query = client.from("meday_journals");
      query =
        revision === null
          ? query.insert({ user_id: userId, payload, revision: next })
          : query
              .update({ payload, revision: next })
              .eq("user_id", userId)
              .eq("revision", revision);
      const { data, error } = await query.select("revision").single();
      if (error || !data)
        throw new Error(
          "서버 저장 실패. 연결을 확인해 주세요. 다른 기기에서 수정했다면 새로고침 후 다시 저장해 주세요.",
          { cause: error },
        );
      revision = data.revision;
      for (const row of [...value.records, ...value.exercises]) {
        const saved = [...payload.records, ...payload.exercises].find(
          (r) => r.id === row.id,
        );
        if (saved?.photoPath) row.photoPath = saved.photoPath;
      }
      // No deletion here: concurrent uploads must never be removed by another tab.
      // Unreferenced photos are retained until an explicit maintenance operation.
    },
  };
}
export async function googleEnabled() {
  if (!cloud) return false;
  const response = await fetch(new URL("/auth/v1/settings", url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("Google 로그인 설정을 확인하지 못했어요.");
  return (await response.json()).external?.google === true;
}
