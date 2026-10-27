import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    {
      name: "social-metadata",
      transformIndexHtml(html) {
        const origin =
          process.env.VITE_SITE_URL ||
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:4173");
        return html.replace(
          "</head>",
          `<link rel="canonical" href="${origin}/">
<meta property="og:type" content="website">
<meta property="og:title" content="me/day — 사진 한 장으로 나의 하루">
<meta property="og:description" content="사진 한 장이면 기록 완료. 식사와 운동, 나의 하루를 가볍게 쌓아요.">
<meta property="og:url" content="${origin}/">
<meta property="og:image" content="${origin}/social.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="me/day — 사진 한 장이면 충분해">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="me/day — 사진 한 장으로 나의 하루">
<meta name="twitter:description" content="사진 한 장이면 기록 완료. 나의 하루를 가볍게 쌓아요.">
<meta name="twitter:image" content="${origin}/social.png"></head>`,
        );
      },
    },
  ],
});
