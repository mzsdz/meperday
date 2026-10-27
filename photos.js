export async function compressImage(file) {
  if (!file.size) throw Error("빈 사진 파일이에요. 다른 사진을 선택해 주세요.");
  if (file.size > 30 * 1024 * 1024)
    throw Error("사진이 너무 커요. 30MB 이하 사진을 선택해 주세요.");
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const signature = String.fromCharCode(...bytes);
  const detected =
    bytes[0] === 0xff && bytes[1] === 0xd8
      ? "image/jpeg"
      : signature.startsWith("\x89PNG")
        ? "image/png"
        : signature.startsWith("GIF8")
          ? "image/gif"
          : signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP"
            ? "image/webp"
            : signature.slice(4, 12) === "ftypavif"
              ? "image/avif"
              : signature.slice(4, 8) === "ftyp" &&
                  /heic|heix|hevc|hevx|mif1|msf1/.test(signature.slice(8))
                ? "image/heic"
                : null;
  const mime = detected || file.type;
  if (!mime?.startsWith("image/")) throw Error("사진 파일을 선택해 주세요.");
  const url = URL.createObjectURL(new Blob([file], { type: mime }));
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => {
        image.src = "";
        reject(
          Error(
            "사진 처리 시간이 길어지고 있어요. 다른 사진으로 다시 시도해 주세요.",
          ),
        );
      }, 20000);
      image.onload = () => {
        clearTimeout(timer);
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(
          Error(
            "이 브라우저에서 사진을 읽지 못했어요. HEIC라면 JPEG 또는 PNG로 내보내 다시 선택해 주세요.",
          ),
        );
      };
      image.src = url;
    });
    const scale = Math.min(
      1,
      960 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw Error(
        "사진을 처리할 공간이 부족해요. 앱을 다시 열고 시도해 주세요.",
      );
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.7);
    if (!result.startsWith("data:image/jpeg;base64,"))
      throw Error("사진 변환에 실패했어요. 다른 사진으로 다시 시도해 주세요.");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
