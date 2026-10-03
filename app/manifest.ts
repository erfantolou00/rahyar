import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "رهیار",
    short_name: "رهیار",
    description: "دستیار مالی شخصی",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "fa",
    dir: "rtl",
    background_color: "#f4f6fc",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
