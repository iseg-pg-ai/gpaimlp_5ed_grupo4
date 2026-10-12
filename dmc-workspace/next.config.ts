import type { NextConfig } from "next";

const portalPrefix =
  process.env.PORTAL_ASSET_PREFIX ??
  (process.env.SAGEMAKER_APP_TYPE === "CodeEditor" ? "/codeeditor/default/ports/3001" : "");

const nextConfig: NextConfig = {
  basePath: portalPrefix,
  skipTrailingSlashRedirect: Boolean(portalPrefix),
  assetPrefix: portalPrefix,
  env: { NEXT_PUBLIC_PORTAL_BASE_PATH: portalPrefix },
  async rewrites() {
    // Resolve locally: SageMaker rewrites Location headers in HTTP redirects.
    return [{ source: "/docs", destination: "/" }];
  },
  reactCompiler: true,
  devIndicators: process.env.SAGEMAKER_APP_TYPE === "CodeEditor" ? false : undefined,
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
