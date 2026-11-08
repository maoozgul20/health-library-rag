/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The index files in /public change only when the corpus changes, so let browsers cache them.
  async headers() {
    return [
      {
        source: "/index/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
