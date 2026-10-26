# Dependências Python e exceção Argos

Estado revisto em 26 de outubro de 2026. O `pyproject.toml` e o `uv.lock`
definem o ambiente Python. `requirements.txt` e
`translations/requirements.txt` são exports gerados por
`scripts/export_requirements.py`; não devem ser editados manualmente.

## Grupos ativos

A instalação base contém o ETL. Os grupos opcionais são:

- `dashboard`: Streamlit e Plotly;
- `agent`: cliente boto3 usado pela integração transacional com Amazon Bedrock;
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

## Tradução em CPU

O grupo `translation` declara PyTorch explicitamente para selecionar wheels CPU
em Linux e Windows. O índice oficial `https://download.pytorch.org/whl/cpu` é
marcado como `explicit` no uv; os restantes pacotes continuam no PyPI. O worker
usa CTranslate2 em CPU/int8; não necessita das dependências NVIDIA/CUDA do
PyTorch Linux por omissão. A escolha segue o
[guia oficial uv/PyTorch](https://docs.astral.sh/uv/guides/integration/pytorch/).

O export de tradução inclui os índices para o pip encontrar `torch==2.14.0+cpu`.
O formato requirements não preserva índices por pacote: o índice CPU aparece
como `--extra-index-url` global. Preferir `uv sync --locked` para conservar a
associação explícita de cada pacote à sua origem. Não editar os exports à mão.

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

A correção dos alertas de 26 de outubro de 2026 fixa pypdf 6.21.2 e exige
Pillow >=13, certifi >=2026.10.19, filelock >=4.2.1 e setuptools >=84.1.0.
O dashboard usa Streamlit 1.66.1, cujo requisito permite Pillow 13; Streamlit
1.55.0 exigia Pillow <13. Esta atualização conserva o resolver normal, sem
ignorar o requisito de Pillow. Referências:
[Pillow](https://github.com/python-pillow/Pillow/security/advisories/GHSA-v9pv-5gc8-w2m6)
e [metadata Streamlit 1.66.1](https://pypi.org/pypi/streamlit/1.66.1/json).

O lockfile resolve Pillow 13.0.0, certifi 2026.10.23, filelock 4.2.4 e
setuptools 84.2.1. `uv audit --locked` analisou 99 pacotes sem vulnerabilidades
conhecidas nessa data. Os alertas GitHub só podem encerrar automaticamente após
a integração das correções no branch predefinido; não os dispensar manualmente.

Validação local em ambiente isolado com todos os grupos: 189 testes Python
(três ignorados), cinco testes de tradução com mocks e dois ensaios EN/PT com
modelos já instalados. As seis áreas do dashboard passaram com `AppTest` sobre
dados sintéticos temporários; o arranque HTTP também foi verificado. O portal
passou `check` (206 testes aprovados e um ignorado) e `build`. O frontend passou
`build` e quatro testes de empacotamento; ambas as auditorias npm ficaram sem
vulnerabilidades conhecidas. Estes ensaios não validam serviços cloud.

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
