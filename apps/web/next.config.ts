import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The Fun tab became Tasks; its album, games and reading live on Today now.
  async redirects() {
    return [{ source: "/fun", destination: "/", permanent: false }];
  },
};

export default nextConfig;
