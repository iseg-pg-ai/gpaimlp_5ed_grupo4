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
