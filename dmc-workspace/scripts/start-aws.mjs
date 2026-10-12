import { createServer } from "node:http";
import next from "next";

const portIndex = process.argv.indexOf("-p");
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT ?? 3001);
const prefix = process.env.PORTAL_ASSET_PREFIX ?? `/codeeditor/default/ports/${port}`;
process.env.PORTAL_ASSET_PREFIX = prefix;
const app = next({ dev: false });
await app.prepare();
const handle = app.getRequestHandler();
createServer((req, res) => {
  // The Studio proxy prefixes root-relative Location headers. Use the full
  // public URL for Next.js redirects (including RSC cache-key corrections).
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (name.toLowerCase() === "location" && typeof value === "string" &&
        (value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`))) {
      const host = req.headers["x-forwarded-host"] ?? req.headers.host;
      const protocol = req.headers["x-forwarded-proto"] ?? "https";
      const origin = process.env.PORTAL_PUBLIC_ORIGIN ?? `${protocol}://${host}`;
      value = new URL(value, origin).href;
    }
    return setHeader(name, value);
  };
  // SageMaker strips the public prefix before forwarding to this port.
  const url = req.url ?? "/";
  const pathname = url.split("?")[0];
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) req.url = `${prefix}${url}`;
  handle(req, res);
}).listen(port, "0.0.0.0", () => console.log(`Portal AWS ready on port ${port}`));
