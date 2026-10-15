# Correção dos alertas Dependabot Python

Revisão de 2026-10-15 no branch `fix/dependabot-python`, criado a partir de
`origin/dev` em `f0d4476`. A alteração cobre os oito pacotes dos alertas anexados.

## Versões resolvidas

| Pacote | Antes | Depois |
| --- | --- | --- |
| GitPython | 3.1.58 | 3.2.1 |
| SageMaker | 2.254.1 | 2.257.7 |
| urllib3 | 2.7.0 | 2.8.0 |
| sqlparse | 0.5.5 | 0.6.0 |
| cryptography | 46.0.7 | 50.0.2 |
| protobuf | 6.31.1 | 6.33.6 |
| Stanza | 1.10.1 | 1.12.2 |
| pytest | 9.0.0 | 9.1.1 |

`pyproject.toml` mantém as versões diretas de SageMaker e pytest e impõe mínimos
de segurança às dependências transitivas. SageMaker permanece na série 2.x;
esta correção não migra as APIs para a série 3.x.

`uv.lock` foi resolvido com uv 0.12.19. Os ficheiros `requirements.txt` e
`translations/requirements.txt` foram regenerados por
`scripts/export_requirements.py`, sem alterações manuais aos pins.

## Exceção de compatibilidade do Argos

Argos Translate 1.11.0 fixa `stanza==1.10.1` no seu próprio metadata.
Essa versão é afetada por
[GHSA-v5jw-96jm-7h2c](https://github.com/advisories/GHSA-v5jw-96jm-7h2c).
O override `stanza>=1.12.2,<1.13` seleciona a primeira série corrigida.
O worker do projeto usa os modelos CTranslate2 e a API de pacotes do Argos;
os seus testes passaram com esta combinação instalada.

Preferir a instalação pelo lockfile:

```bash
uv sync --locked --group translation
```

O export pip contém o grafo completo, mas o pip não interpreta os overrides de
uv. A instalação desse export exige desativar a resolução adicional:

```bash
python -m pip install --no-deps -r translations/requirements.txt
```

Sem `--no-deps`, o pip rejeita a incompatibilidade com o pin antigo do Argos.
Ferramentas como `pip check` também podem assinalar essa diferença de metadata.
Reavaliar este override quando o Argos publicar um requisito de Stanza corrigido.

## Validação executada

- Instalação de todos os grupos com `uv sync --locked --inexact --all-groups`.
- `uv lock --check --offline` e exports `--check`: aprovados.
- Testes Python: 20 aprovados; testes de tradução: cinco aprovados.
- Imports dos oito pacotes corrigidos, Streamlit e Argos: aprovados.
- Auditoria `pip-audit` do export de todos os grupos: zero vulnerabilidades conhecidas.
- Auditoria dos 220 pacotes de registry de todas as plataformas do lockfile:
  zero vulnerabilidades conhecidas.

As auditorias usaram versões fixas com `--no-deps --disable-pip`, sem instalar
os pacotes durante a consulta. Os resultados representam a base de avisos
disponível na data da revisão.

Os testes de tradução usam modelos simulados; não existem pares de modelos
locais neste ambiente. Não foram executadas inferências reais, deployments ou
chamadas aos serviços SageMaker. O SDK 2.x emite um aviso de descontinuação;
a sua migração para 3.x exige uma alteração própria.

## Referências de segurança

- [GitPython: injeção de configuração](https://github.com/advisories/GHSA-284h-m62q-gf8w).
- [SageMaker: chave HMAC exposta](https://github.com/advisories/GHSA-7hh5-prp2-mfh5).
- [urllib3: correções na série 2.8](https://github.com/urllib3/urllib3/releases).
- [sqlparse: complexidade de TokenList](https://github.com/advisories/GHSA-pwgv-4x5q-6m9f).
- [protobuf: limite de recursão JSON](https://github.com/advisories/GHSA-7gcm-g887-7qv7).
