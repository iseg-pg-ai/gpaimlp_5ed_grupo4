# Runbook de monitoring

Procedimentos locais para diagnóstico inicial. Não incluir prompts, contactos,
PDFs, credenciais ou corpos de pedidos em tickets e mensagens.

## Serviço indisponível

1. Confirmar se a falha ocorreu em duas sondas consecutivas.
2. Verificar o processo e o endpoint local correspondente.
3. Consultar apenas códigos técnicos e horários dos eventos.
4. Reiniciar o serviço pelo ponto de entrada documentado, se autorizado.
5. Confirmar recuperação no painel e registar causa e ação.

## Portal com erros

O alerta abre com cinco erros em 24 horas. Identificar operações e códigos técnicos,
reproduzir sem dados de clientes e confirmar catálogo e subprocesso Python. Se houver
risco de escrita incorreta, suspender alterações e preservar o catálogo para análise.

## Warehouse inválido ou desatualizado

O limiar preliminar é sete dias. Confirmar `manifest.json` e
`validation_report.json`; executar o ETL apenas pelo fluxo documentado. Nunca editar
o warehouse manualmente. Em falha, conservar a última entrega válida.

## Backup falhado

Confirmar espaço em disco, permissões de `monitoring/runtime/` e estado IAM dos
buckets. Não declarar os dados protegidos enquanto o painel não mostrar cópia e
restauro verificados. O backup agendado local não cobre perda da máquina; para uma
paragem controlada, `just blu it` exige um checkpoint confirmado no bucket remoto.

## Disco elevado

Aos 85%, o monitoring limpa caches regeneráveis e aplica retenção aos backups. Aos
90%, abre incidente. Se continuar elevado, medir diretórios antes de remover algo e
preservar dados, exports, ambientes, dependências e credenciais.

## IA indisponível ou com falhas

O alerta abre com três falhas em 24 horas. Confirmar saúde do agente, credenciais IAM,
timeouts e região sem efetuar chamadas pagas de teste por defeito. O portal deve
continuar a permitir os fluxos determinísticos.

## Monitoring indisponível

Consultar `GET /health`, que devolve apenas o estado do processo. Se a máquina inteira
estiver inacessível, a deteção depende de uma sonda externa, ainda por instalar no
ambiente de deployment.

## Escalação e fecho

Em 28 de outubro de 2026, o utilizador confirmou que é o único operador e
responsável. Não foi indicado substituto. O canal externo e o prazo de resposta
continuam por confirmar; não assumir cobertura contínua ou escalamento para
outra pessoa.

Fechar um incidente apenas depois da recuperação observada e, quando aplicável,
de um restauro ou fluxo funcional controlado. A preparação local não inclui
uma nova sonda fora do workspace nem um novo ensaio real de receção SNS.
