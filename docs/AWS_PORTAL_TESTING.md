# Deployment e teste do portal na AWS

Este guia destina-se ao tester do DMC Workspace. O objetivo é publicar o portal
Next.js, confirmar que os ficheiros JavaScript são servidos pelo caminho correto
e recolher informação suficiente caso ainda exista algum erro 404.

## Âmbito

- Aplicação: `dmc-workspace` (Next.js).
- Branch: `fix/aws-javascript-runtime`.
- Porta interna: `3001`.
- Health check: `GET /` com resposta HTTP `200`.
- Assets do browser: `/_next/static/*`.

O dashboard Streamlit em `dashboard/app.py` não faz parte deste teste. O portal
tem rotas de servidor e APIs, pelo que não pode ser alojado apenas como um site
estático num bucket S3.

## Pré-requisitos

- Acesso à máquina ou serviço onde o portal será executado.
- Git.
- Node.js entre 22.13 e 24.x, ou Docker.
- Porta `3001` disponível dentro do serviço.
- Acesso ao Application Load Balancer e ao CloudFront, caso sejam utilizados.
- Variáveis de ambiente da instalação, sem colocar segredos no repositório.

Confirmar a versão de Node.js:

```bash
node --version
```

## 1. Obter o branch

Na máquina de deployment:

```bash
git fetch origin
git switch fix/aws-javascript-runtime
git pull --ff-only origin fix/aws-javascript-runtime
```

Confirmar o commit que está a ser testado:

```bash
git rev-parse --short HEAD
git status --short
```

O segundo comando não deve apresentar alterações locais.

## 2. Publicar o portal

Escolher apenas uma das opções seguintes.

### Opção A — execução direta em EC2

A partir da raiz do repositório:

```bash
chmod +x scripts/start_portal.sh
PORT=3001 PORTAL_HOST=0.0.0.0 ./scripts/start_portal.sh
```

O script:

1. entra na pasta `dmc-workspace`;
2. executa `npm ci`;
3. cria um build novo;
4. confirma `.next/BUILD_ID` e `.next/static`;
5. inicia o Next.js em `0.0.0.0:3001`.

O processo deve permanecer em execução. Para um serviço permanente, o mesmo
comando pode ser gerido por `systemd`, pelo supervisor já utilizado na instância
ou pelo serviço de deployment escolhido.

### Opção B — Docker em ECS, App Runner ou EC2

A partir da raiz do repositório:

```bash
docker build -f Dockerfile.portal -t blu-dmc-portal .
docker run --rm --name blu-dmc-portal \
  --env-file .env \
  -p 3001:3001 \
  blu-dmc-portal
```

No ECS, definir no container:

- Container port: `3001`.
- Protocol: `TCP`.
- Health check ou target group: `GET /`.
- Variável `PORT`: `3001`.
- Variável `HOSTNAME`: `0.0.0.0`, caso a plataforma substitua o `CMD`.

As pastas `data/portal` e `exports` precisam de armazenamento persistente para
preservar alterações ao catálogo, versões e PDFs entre substituições do
container.

## 3. Confirmar o portal antes do load balancer

Executar na própria máquina ou dentro da rede onde o serviço está acessível:

```bash
curl --fail --show-error --head http://127.0.0.1:3001/
```

Resultado esperado:

```text
HTTP/1.1 200 OK
```

Confirmar que o HTML referencia assets Next.js:

```bash
curl --fail --silent http://127.0.0.1:3001/ \
  | grep -oE '/_next/static/[^" ]+' \
  | head
```

Copiar um dos caminhos devolvidos e testá-lo:

```bash
curl --fail --show-error --head \
  http://127.0.0.1:3001/_next/static/chunks/NOME_DO_FICHEIRO.js
```

O resultado deve ser HTTP `200`. Se aqui já existir um 404, guardar os logs do
build e confirmar que o processo foi iniciado por `scripts/start_portal.sh` ou
pelo `Dockerfile.portal`.

## 4. Configurar a porta 3001 no Application Load Balancer

No EC2 ou ECS:

1. Abrir **EC2 → Target groups**.
2. Criar ou editar o target group do portal.
3. Definir protocolo `HTTP` e porta `3001`.
4. Registar a instância, IP ou serviço ECS nesse target group.
5. Configurar o health check:
   - Protocol: `HTTP`;
   - Port: `traffic port`;
   - Path: `/`;
   - Success codes: `200`.
6. Abrir **Load Balancers → Listeners and rules**.
7. No listener HTTPS `443`, encaminhar o domínio ou regra do portal para este
   target group.
8. Esperar até o target aparecer como **Healthy**.

No security group do serviço, permitir a porta `3001` com origem no security
group do load balancer. Não é necessário expor a porta `3001` a toda a Internet.

Testar diretamente o DNS do load balancer:

```bash
curl --fail --show-error --head https://DNS_DO_LOAD_BALANCER/
```

Repetir o teste com um caminho `/_next/static/...` obtido do HTML do load
balancer. Ambos devem devolver HTTP `200`.

## 5. Configurar o CloudFront

No CloudFront, o origin do portal deve ser o Application Load Balancer ou o
serviço que está efetivamente a executar o Next.js.

Verificar estas definições:

- **Origin domain:** DNS do load balancer/serviço.
- **Origin path:** vazio.
- **Default behavior (`*`):** encaminhado para o origin do portal.
- **Allowed methods do comportamento principal:** todos os métodos necessários,
  incluindo `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH` e `DELETE`, porque o
  portal utiliza rotas `/api/*`.
- **Cache do comportamento principal:** desativado ou adequado a conteúdo
  dinâmico.
- **Behavior `/_next/static/*`:** encaminhado para o mesmo origin do portal.
- **Allowed methods de `/_next/static/*`:** `GET` e `HEAD`.
- **Cache de `/_next/static/*`:** pode usar uma política otimizada, pois os nomes
  dos chunks mudam em cada build.

Se existir um origin S3, garantir que o comportamento `/_next/static/*` não está
a ser enviado para esse bucket. O primeiro comportamento correspondente ao path
é o que o CloudFront utiliza.

## 6. Invalidar o cache do CloudFront

### Pela consola

1. Abrir **CloudFront → Distributions**.
2. Selecionar a distribuição do portal.
3. Abrir **Invalidations**.
4. Escolher **Create invalidation**.
5. Introduzir:

```text
/*
```

1. Esperar que o estado passe de `In progress` para `Completed`.

### Pela AWS CLI

```bash
aws cloudfront create-invalidation \
  --distribution-id ID_DA_DISTRIBUICAO \
  --paths "/*"
```

Consultar o estado:

```bash
aws cloudfront list-invalidations \
  --distribution-id ID_DA_DISTRIBUICAO
```

## 7. Teste final no browser

Usar uma janela privada para reduzir interferência do cache local:

1. Abrir o endereço público do portal.
2. Abrir as Developer Tools com `F12`.
3. No separador **Network**, ativar **Disable cache**.
4. Filtrar por `JS` e recarregar a página com `Ctrl+Shift+R`.
5. Confirmar que todos os pedidos `/_next/static/...` respondem com `200`.
6. No separador **Console**, confirmar que não existem:
   - `404 (Not Found)`;
   - `ChunkLoadError`;
   - `Failed to load resource`;
   - `Unexpected token '<'`;
   - erros de MIME type para JavaScript.
7. Testar a página principal, Catálogo, Histórico, Referências e Lixo.
8. Criar uma viagem de teste e confirmar que as chamadas `/api/*` não devolvem
   404, 502 ou 503.

Também pode ser testado um asset pela linha de comandos:

```bash
curl --fail --show-error --head \
  https://DOMINIO_DO_PORTAL/_next/static/chunks/NOME_DO_FICHEIRO.js
```

## 8. Feedback a entregar

Copiar e preencher este bloco:

```text
Data e hora do teste:
Tester:
Branch:
Commit (`git rev-parse --short HEAD`):
URL testado:
Método de deployment: script / Docker / outro
Serviço AWS: EC2 / ECS / App Runner / outro
CloudFront: sim / não
Target do load balancer saudável: sim / não / não aplicável
Página principal: passou / falhou
Assets /_next/static: passou / falhou
APIs /api/*: passou / falhou
Erros na consola: nenhum / indicar abaixo
Resultado final: passou / falhou

Erros encontrados:
- URL completa do pedido:
- Código HTTP:
- Mensagem da consola:
- Página e ação que provocaram o erro:
- O erro também acontece numa janela privada?:
```

Em caso de falha, anexar o conteúdo textual do erro e o URL completo do pedido.
Não incluir passwords, tokens, cookies, chaves da AWS ou outras credenciais.

## Referências AWS

- [Target groups do Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [Health checks do Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [Comportamentos de cache do CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html)
- [Invalidação de ficheiros do CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation_Requests.html)
