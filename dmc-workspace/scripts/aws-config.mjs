// Resolve a configuração AWS do portal e verifica a existência de uma build utilizável antes
// do arranque.
import { readFileSync, readdirSync } from "node:fs";

export function awsConfig(env = process.env, args = process.argv.slice(2)) {
  const index = args.indexOf("-p");
  const port = Number(index >= 0 ? args[index + 1] : (env.PORT ?? 3001));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Porta inválida: usar um inteiro entre 1 e 65535.");
  }
  let origin;
  try {
    origin = new URL(env.PORTAL_PUBLIC_ORIGIN);
  } catch {
    throw new Error("Definir PORTAL_PUBLIC_ORIGIN com a origem HTTPS da própria instância Studio.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "PORTAL_PUBLIC_ORIGIN deve conter apenas a origem HTTPS, sem caminho ou credenciais.",
    );
  }
  const prefix = env.PORTAL_ASSET_PREFIX ?? `/codeeditor/default/ports/${port}`;
  if (
    !/^\/codeeditor\/[^/\s?#%]+\/ports\/\d+$/.test(prefix) ||
    Number(prefix.split("/").at(-1)) !== port
  ) {
    throw new Error(
      "PORTAL_ASSET_PREFIX deve ser /codeeditor/NOME/ports/PORTA e corresponder à porta do servidor.",
    );
  }
  return { port, prefix, origin: origin.origin };
}

export function validateBuild(prefix, directory = ".next") {
  let config;
  try {
    if (
      !readFileSync(`${directory}/BUILD_ID`, "utf8").trim() ||
      !readdirSync(`${directory}/static`).length
    )
      throw new Error();
    config = JSON.parse(readFileSync(`${directory}/required-server-files.json`, "utf8")).config;
  } catch {
    throw new Error(
      "Build ausente ou incompleto. Executar bash scripts/start_aws_portal.sh na raiz.",
    );
  }
  if (
    config?.basePath !== prefix ||
    config?.assetPrefix !== prefix ||
    config?.env?.NEXT_PUBLIC_PORTAL_BASE_PATH !== prefix
  ) {
    throw new Error(
      "O prefixo do build difere do arranque. Recompilar com bash scripts/start_aws_portal.sh na raiz.",
    );
  }
}
