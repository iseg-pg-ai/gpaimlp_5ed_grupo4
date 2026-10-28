// Configura o runtime Next.js e as opções partilhadas pelo desenvolvimento e pela build.
import type { NextConfig } from "next";

const portalPrefix =
  process.env.PORTAL_ASSET_PREFIX ??
  (process.env.SAGEMAKER_APP_TYPE === "CodeEditor" ? "/codeeditor/default/ports/3001" : "");

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.PORTAL_PUBLIC_ORIGIN
    ? [new URL(process.env.PORTAL_PUBLIC_ORIGIN).hostname]
    : undefined,
  basePath: portalPrefix,
  skipTrailingSlashRedirect: Boolean(portalPrefix),
  assetPrefix: portalPrefix,
  env: { NEXT_PUBLIC_PORTAL_BASE_PATH: portalPrefix },
  turbopack: {
    rules: portalPrefix
      ? Object.fromEntries(
          ["**/next-devtools/index.js", "**/next-devtools/shared/stack-frame.js"].map((pattern) => [
            pattern,
            {
              loaders: [
                {
                  loader: "./scripts/devtools-prefix-loader.cjs",
                  options: { prefix: portalPrefix },
                },
              ],
            },
          ]),
        )
      : {},
  },
  async rewrites() {
    // Resolve locally: SageMaker rewrites Location headers in HTTP redirects.
    return [{ source: "/docs", destination: "/" }];
  },
  reactCompiler: true,
  devIndicators: process.env.SAGEMAKER_APP_TYPE === "CodeEditor" ? false : undefined,
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
