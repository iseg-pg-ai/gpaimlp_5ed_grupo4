# Dependências Python e exceção Argos

Estado revisto em 20 de outubro de 2026. O `pyproject.toml` e o `uv.lock`
definem o ambiente Python. `requirements.txt` e
`translations/requirements.txt` são exports gerados por
`scripts/export_requirements.py`; não devem ser editados manualmente.

## Grupos ativos

A instalação base contém o ETL. Os grupos opcionais são:

- `dashboard`: Streamlit e Plotly;
- `agent`: FastAPI, LangGraph, integração Bedrock e respetivas dependências;
- `translation`: Argos Translate e CTranslate2.

SageMaker SDK, MLflow, pytest, sqlparse e cryptography não pertencem ao ambiente
atual. O projeto usa a função IAM do ambiente AWS através de boto3; não precisa do
SDK SageMaker.

Preparar tudo com:

```bash
uv sync --locked --all-groups
```

`uv sync` sem `--all-groups` pode remover grupos opcionais que já estejam
instalados. Para acrescentar um grupo preservando o ambiente existente, usar
`--inexact --group NOME`.

## Exceção de compatibilidade do Argos

Argos Translate 1.11.0 fixa `stanza==1.10.1` no seu metadata. Essa versão é
afetada por
[GHSA-v5jw-96jm-7h2c](https://github.com/advisories/GHSA-v5jw-96jm-7h2c).
O projeto aplica `stanza>=1.12.2,<1.13` através de
`override-dependencies` no `pyproject.toml`.

Preferir o lockfile:

```bash
uv sync --locked --inexact --group translation
python translations/setup_models.py
```

O export pip contém o grafo resolvido, mas o pip não interpreta overrides de uv.
Quando `uv` não puder ser usado, instalar o export de tradução sem nova resolução:

```bash
python -m pip install --no-deps -r translations/requirements.txt
```

Sem `--no-deps`, o resolver pode rejeitar a diferença entre o metadata do Argos
e a versão corrigida de Stanza. Reavaliar o override quando o Argos publicar um
requisito corrigido.

## Manutenção e validação

Depois de alterar dependências:

```bash
uv lock --check --offline
python scripts/export_requirements.py --check
PYTHONPATH=src .venv/bin/python -B -m unittest discover -s tests -v
.venv/bin/python -B -m unittest translations.test_worker -v
```

Executar também os testes e builds da área afetada. Os testes de tradução usam
modelos simulados por defeito; não comprovam que os pares de idiomas estejam
instalados nem a qualidade de uma tradução real. Auditorias de vulnerabilidades
representam apenas a base de avisos disponível na data da execução.
