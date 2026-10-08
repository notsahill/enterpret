import type { NextConfig } from "next";

// GITHUB_PAGES=true produces a static export in out/. The workflow removes
// app/api first, since route handlers can't be exported. BASE_PATH is the
// repo sub-path (e.g. /enterpret) and stays empty for a custom domain.
const isPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer"],
  turbopack: { root: import.meta.dirname },
  ...(isPages && {
    output: "export",
    basePath: process.env.BASE_PATH || "",
    images: { unoptimized: true },
  }),
  env: { NEXT_PUBLIC_STATIC_EXPORT: isPages ? "1" : "" },
};

export default nextConfig;
