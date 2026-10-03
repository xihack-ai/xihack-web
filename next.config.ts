import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.HIRESPEC_STATIC_EXPORT === "1" ? {
    output: "export" as const,
    images: { unoptimized: true },
  } : {}),
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
