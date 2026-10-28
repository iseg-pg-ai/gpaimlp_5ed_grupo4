// Coordena o arranque AWS com a configuração do proxy e o estado operacional preparado.
import { createServer } from "node:http";
import next from "next";
import { awsConfig, validateBuild } from "./aws-config.mjs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const { port, prefix, origin } = awsConfig();
const dev = process.argv.includes("--dev");
if (!dev) validateBuild(prefix);
process.env.PORTAL_ASSET_PREFIX = prefix;
process.env.PORTAL_PUBLIC_ORIGIN = origin;
// Tal como as restantes interfaces, expor apenas no loopback. O proxy HTTPS do
// SageMaker encaminha a porta sem tornar o servidor acessível noutras interfaces.
const hostname = "127.0.0.1";
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
createServer((req, res) => {
  // O Studio altera redirecionamentos relativos; usar a origem validada.
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (
      name.toLowerCase() === "location" &&
      typeof value === "string" &&
      (value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`))
    ) {
      value = new URL(value, origin).href;
    }
    return setHeader(name, value);
  };
  // O SageMaker remove o prefixo público antes de encaminhar o pedido.
  const url = req.url ?? "/";
  const pathname = url.split("?")[0];
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) req.url = `${prefix}${url}`;
  Promise.resolve(handle(req, res)).catch(() => {
    console.error("Falha ao processar um pedido no portal.");
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
})
  .on("upgrade", (req) => {
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) req.url = `${prefix}${url}`;
    // Next registers its dev upgrade handler after the first HTTP request.
    // This listener runs first and restores the URL before that handler.
  })
  .on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `A porta ${port} já está ocupada. Encerrar o servidor anterior ou escolher outra porta.`
        : `Falha no arranque: ${error.code ?? "erro desconhecido"}`,
    );
    process.exit(1);
  })
  .listen(port, hostname, () => console.log(`Portal disponível em ${origin}${prefix}/`));
