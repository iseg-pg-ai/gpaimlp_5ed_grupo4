# Cartografia do dashboard

`region.geojson` contém contornos da Europa e do norte de África extraídos de Natural Earth, escala 1:50m, camada `admin_0_countries`.
São apresentados localmente como contexto, sem serviços de mosaicos ou pedidos
cartográficos externos no navegador. Não constituem cartografia de navegação.

Fonte: [Natural Earth, repositório de dados](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson).
Dados de [domínio público](https://www.naturalearthdata.com/about/terms-of-use/).
Obtidos em 2026-10-16; propriedades reduzidas ao nome do país, sem simplificar
as coordenadas. Polígonos distantes ficam fora deste enquadramento regional. O mapa usa a área
disponível, permite deslocação e inclui controlos de zoom e reposição da vista.

A vista usa projeção Mercator em eixos com escala geográfica proporcional,
altura de 420 px e largura adaptável ao cartão, evitando bandas laterais.

## Exploração e apresentação

- Um clique no mapa abre a ficha correspondente. Ative o agrupamento aproximado
  por grelha de 0,1 graus para reduzir sobreposições e escolher membros do grupo.
  Não é um agrupamento por distância exata, nem se desfaz automaticamente com zoom.
- As camadas do mapa não alteram os filtros ou a comparação do catálogo.
- Compare duas a quatro opções da seleção atual, preservando unidades e condições
  nas descrições da fonte; não é calculado um vencedor ou preço agregado.
- O painel Destinos usa a localização literal da fonte, sem geocodificar ou atribuir
  experiências regionais a cidades por aproximação.
- As fichas de atrações consultam `id_atracao_base` para contar roteiros distintos.
  Ausência de relação não significa ausência de procura. Restaurantes e experiências
  não recebem correspondências inferidas por nome.
- A revisão prioritária sinaliza campos vazios e expressões de confirmação. Preço e
  condições têm prioridade comercial; os restantes campos têm prioridade operacional.
  Esta regra não certifica a atualidade nem deteta todos os problemas possíveis.
- O modo apresentação oculta a barra lateral e mantém navegação e saída no topo.
  Não publica dados nem substitui o modo de ecrã inteiro do navegador.

Validação dos contratos: `PYTHONPATH=src .venv/bin/python -B -m unittest tests.test_dashboard -v`.
Os testes são ignorados se o grupo opcional `dashboard` não estiver instalado.
