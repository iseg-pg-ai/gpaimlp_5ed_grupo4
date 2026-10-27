#!/bin/bash
# Primeiro arranque do servidor do portal (Amazon Linux 2023, sem internet).
# O CDK substitui os marcadores __NOME__. Os dados vivem num disco próprio e só são
# semeados uma vez: atualizações de código nunca substituem o catálogo nem as versões.
set -euo pipefail
# Também na consola da instância: sem internet nem SSM, é por aí que se lê um arranque falhado.
exec > >(tee -a /var/log/blu-portal-setup.log /dev/console) 2>&1

RELEASE_BUCKET='__RELEASE_BUCKET__'
SEED_URL='__SEED_URL__'
VOLUME_ID='__VOLUME_ID__'
STATE=/srv/blu/state

# Python só com a biblioteca padrão (portal.data, catálogo, observatório): os repositórios
# do Amazon Linux estão no S3 da região e chegam pelo gateway endpoint.
dnf install -y -q python3.12 || dnf install -y -q python3.11 || true
PYTHON=$(command -v python3.12 || command -v python3.11 || command -v python3)

id blu >/dev/null 2>&1 || useradd --system --home-dir /srv/blu --shell /sbin/nologin blu
mkdir -p /srv/blu/releases

# Disco de dados: espera pela ligação e só formata se ainda não tiver sistema de ficheiros.
# Até 30 minutos, para cobrir a troca de servidor em dois deploys (o disco liga no segundo).
device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${VOLUME_ID//-/}"
for _ in $(seq 1 360); do [ -e "$device" ] && break; sleep 5; done
[ -e "$device" ] || { echo "Disco de dados $VOLUME_ID não ligado"; exit 1; }
blkid "$device" >/dev/null || mkfs.xfs -L blu-state "$device"
mkdir -p "$STATE"
grep -q 'LABEL=blu-state' /etc/fstab || echo 'LABEL=blu-state /srv/blu/state xfs defaults,nofail 0 2' >> /etc/fstab
mountpoint -q "$STATE" || mount "$STATE"

# Semente única (warehouse, catálogo e versões exportadas), apenas com caminhos relativos.
if [ ! -e "$STATE/.seeded" ] && [ -n "$SEED_URL" ]; then
  aws s3 cp --only-show-errors "$SEED_URL" /tmp/seed.tgz
  if tar -tzf /tmp/seed.tgz | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo 'Semente com caminhos inseguros'; exit 1; fi
  tar -xzf /tmp/seed.tgz -C "$STATE" --no-same-owner --no-same-permissions
  rm -f /tmp/seed.tgz
fi
touch "$STATE/.seeded"
mkdir -p "$STATE"/{data/portal,warehouse,exports/itineraries,exports/portal-persistence,monitoring,home}
chown -R blu:blu "$STATE"

cat > /srv/blu/portal.env <<EOF
NODE_ENV=production
HOME=$STATE/home
AWS_REGION=__REGION__
BLU_DATA_DIR=$STATE/data
BLU_WAREHOUSE_DIR=$STATE/warehouse
BLU_EXPORT_DIR=$STATE/exports/itineraries
BLU_OPERATIONAL_DIR=$STATE/exports/portal-persistence
BLU_TELEMETRY_DIR=$STATE/monitoring
BLU_CONVERSATION_TABLE=__MESSAGE_TABLE__
BLU_INTELLIGENCE_TABLE=__INTELLIGENCE_TABLE__
BLU_PYTHON=$PYTHON
NEXT_TELEMETRY_DISABLED=1
EOF

# Atualizador: a cada 2 minutos lê a configuração do portão e a versão atual no S3;
# confirma o SHA-256, ativa a versão nova e reinicia os serviços. Guarda as 3 últimas.
cat > /usr/local/bin/blu-portal-update <<EOF
#!/bin/bash
set -euo pipefail
# Região explícita: sem ela a CLI pode tentar o endpoint global do S3, que o gateway não cobre.
export AWS_DEFAULT_REGION='__REGION__'
B='$RELEASE_BUCKET'
R=/srv/blu/releases
changed=0
aws s3 cp --only-show-errors "s3://\$B/config/gate.json" /srv/blu/gate.json.new || { echo 'Sem configuração do portão no S3'; exit 0; }
if cmp -s /srv/blu/gate.json.new /srv/blu/gate.json; then rm -f /srv/blu/gate.json.new; else mv /srv/blu/gate.json.new /srv/blu/gate.json; changed=1; fi
printf 'BLU_PUBLIC_URL=%s\n' "\$(python3 -c 'import json; print(json.load(open("/srv/blu/gate.json"))["publicOrigin"])')" > /srv/blu/runtime.env
aws s3 cp --only-show-errors "s3://\$B/releases/current.json" /tmp/blu-current.json || { echo 'Ainda sem versão publicada'; exit 0; }
read -r id key sha < <(python3 -c 'import json; c=json.load(open("/tmp/blu-current.json")); print(c["release"], c["key"], c["sha256"])')
[[ "\$id" =~ ^[A-Za-z0-9._-]+\$ && "\$key" == "releases/\$id.tar.gz" && "\$sha" =~ ^[0-9a-f]{64}\$ ]] || { echo 'current.json inválido'; exit 1; }
if [ ! -d "\$R/\$id" ]; then
  aws s3 cp --only-show-errors "s3://\$B/\$key" /tmp/blu-release.tgz
  echo "\$sha  /tmp/blu-release.tgz" | sha256sum -c --quiet -
  rm -rf "\$R/\$id.tmp" && mkdir "\$R/\$id.tmp"
  tar -xzf /tmp/blu-release.tgz -C "\$R/\$id.tmp" --no-same-owner
  chown -R blu:blu "\$R/\$id.tmp/dmc-workspace/.next"
  mv "\$R/\$id.tmp" "\$R/\$id"
  rm -f /tmp/blu-release.tgz
fi
if [ "\$(readlink /srv/blu/current || true)" != "\$R/\$id" ]; then ln -sfn "\$R/\$id" /srv/blu/current.new && mv -T /srv/blu/current.new /srv/blu/current; changed=1; fi
if [ "\$changed" = 1 ]; then echo "A ativar a versão \$id"; systemctl restart blu-portal blu-gate; fi
ls -1dt "\$R"/*/ | tail -n +4 | xargs -r rm -rf
echo "Versão \$id; portal \$(systemctl is-active blu-portal || true), portão \$(systemctl is-active blu-gate || true)"
EOF
chmod 755 /usr/local/bin/blu-portal-update

cat > /etc/systemd/system/blu-portal.service <<'EOF'
[Unit]
Description=Portal BLU (Next.js, só local)
After=network-online.target
ConditionPathExists=/srv/blu/current

[Service]
User=blu
WorkingDirectory=/srv/blu/current/dmc-workspace
EnvironmentFile=/srv/blu/portal.env
EnvironmentFile=-/srv/blu/runtime.env
ExecStart=/srv/blu/current/node/bin/node /srv/blu/current/dmc-workspace/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001
Restart=always
RestartSec=5
# Sem SSM nem internet, a consola da instância é a única janela para os logs.
StandardOutput=journal+console
StandardError=journal+console
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/blu-gate.service <<'EOF'
[Unit]
Description=Portão de login do portal BLU
After=network-online.target
ConditionPathExists=/srv/blu/current
ConditionPathExists=/srv/blu/gate.json

[Service]
User=blu
Environment=GATE_CONFIG=/srv/blu/gate.json GATE_PORT=8080
ExecStart=/srv/blu/current/node/bin/node /srv/blu/current/infra/portal/gate.mjs
Restart=always
RestartSec=5
# Sem SSM nem internet, a consola da instância é a única janela para os logs.
StandardOutput=journal+console
StandardError=journal+console
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/blu-portal-update.service <<'EOF'
[Unit]
Description=Ativa a versão mais recente do portal BLU

[Service]
Type=oneshot
ExecStart=/usr/local/bin/blu-portal-update
StandardOutput=journal+console
StandardError=journal+console
EOF

cat > /etc/systemd/system/blu-portal-update.timer <<'EOF'
[Unit]
Description=Procura uma versão nova do portal BLU a cada 2 minutos

[Timer]
OnBootSec=30s
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable blu-portal blu-gate
systemctl enable --now blu-portal-update.timer
