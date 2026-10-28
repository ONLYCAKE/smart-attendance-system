import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@smart-attendance/shared"],
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@vladmandic/human": false,
      };
    } else {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@vladmandic/human": path.resolve(
          __dirname,
          "node_modules/@vladmandic/human/dist/human.esm.js"
        ),
      };
    }
    return config;
  },
};

export default nextConfig;
