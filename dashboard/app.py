"""Observatório BLU: exploração só de leitura da entrega publicada pelo ETL."""
from __future__ import annotations

import json
from html import escape as escape_plot_text
import math
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE = ROOT / "warehouse"
DATABASE = WAREHOUSE / "blu_etl.sqlite"
COLORS = ["#66e5cf", "#d8b776", "#799dff"]
MAP_HEIGHT = 420


def query(sql: str, params: tuple = ()) -> pd.DataFrame:
    """Ler a entrega publicada, sem cache que sobreviva a uma nova publicação."""
    with sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True) as connection:
        return pd.read_sql_query(sql, connection, params=params)


def load_json(name: str) -> dict:
    return json.loads((WAREHOUSE / name).read_text(encoding="utf-8"))


def catalog_data() -> pd.DataFrame:
    frame = query("""
        SELECT id AS Identificador, 'Atração' AS Tipo, nome_da_atracao AS Nome,
        cidade AS Localização, categoria AS Categoria, descricao_curada AS Descrição,
        latitude, longitude, horario AS Horário, preco_da_atracao AS Preço,
        site_fonte AS Fonte, tempo_medio_de_visita AS Duração,
        necessidade_de_reserva AS Condições, acessibilidade_nivel_de_confirmacao AS Acessibilidade FROM atracoes
        UNION ALL
        SELECT id_blu, 'Restaurante', estabelecimento, cidade, tipo_gastronomia_base,
        observacoes_da_base, latitude, longitude, horario_base_reconfirmar,
        preco_nao_cotacao, fonte_indicada_na_base, duracao_blu_estimativa,
        reservas_condicoes_base, acessibilidade_nivel_de_confirmacao FROM restaurantes
        UNION ALL
        SELECT nome_da_experiencia, 'Experiência', nome_da_experiencia, localizacao,
        categoria, descricao, NULL, NULL, horario, preco, site_fonte, duracao,
        modalidade, acessibilidade_nivel_de_confirmacao FROM experiencias
    """)
    frame["Chave"] = frame.Tipo + ":" + frame.Identificador.astype(str)
    return frame



def style() -> None:
    st.markdown((Path(__file__).with_name("style.css")).read_text(), unsafe_allow_html=True)


def heading(number: str, title: str, description: str) -> None:
    st.caption(f"OBSERVATÓRIO BLU / {number}")
    st.title(title)
    st.write(description)


def chart(fig, *, map_controls: bool = False, key: str | None = None):
    fig.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)",
                      plot_bgcolor="rgba(0,0,0,0)", font=dict(color="#b5c6d2", family="sans-serif"),
                      margin=dict(l=0, r=0 if map_controls else 12, t=30, b=0), legend_title_text="", legend=dict(font=dict(color="#b5c6d2")),
                      colorway=COLORS)
    fig.update_xaxes(gridcolor="#1d303d", zeroline=False)
    fig.update_yaxes(gridcolor="#1d303d", zeroline=False)
    config = {"displayModeBar": False}
    if map_controls:
        config = {"displayModeBar": True, "scrollZoom": True,
                  "modeBarButtons": [["zoomIn2d", "zoomOut2d", "resetScale2d"]],
                  "displaylogo": False}
    if map_controls:
        return st.plotly_chart(fig, width="stretch", config=config, key=key,
                               on_select="rerun", selection_mode="points")
    return st.plotly_chart(fig, width="stretch", config=config)


def metrics(items: list[tuple]) -> None:
    for col, (label, value, note) in zip(st.columns(len(items)), items):
        with col:
            st.metric(label, value)
            st.caption(note)


def located(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    for field in ("latitude", "longitude"):
        frame[field] = pd.to_numeric(frame[field], errors="coerce")
    return frame[frame.latitude.between(-90, 90) & frame.longitude.between(-180, 180)]


def map_options(*, key: str) -> tuple[list[str], bool, bool]:
    with st.expander("Camadas e apresentação do mapa"):
        layers = st.multiselect("Camadas do mapa", ["Atração", "Restaurante"],
                                default=["Atração", "Restaurante"], key=f"{key}_layers")
        labels = st.checkbox("Mostrar nomes dos lugares", value=True, key=f"{key}_labels")
        clustered = st.checkbox("Agrupar por proximidade (~10 km)", key=f"{key}_cluster")
    return layers, labels, clustered


def map_chart(frame: pd.DataFrame, *, key: str, options: tuple | None = None) -> list[str]:
    layers, labels, clustered = options if options is not None else map_options(key=key)
    points = located(frame[frame.Tipo.isin(layers)])
    if points.empty:
        with st.container(height=MAP_HEIGHT, border=False):
            st.info("Não existem coordenadas válidas nas camadas selecionadas.")
        return []
    # Projeção Mercator em eixos cartesianos para preencher cartões de qualquer proporção.
    def mercator(latitude: float) -> float:
        latitude = max(-85, min(85, latitude))
        return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2)))

    points = points.assign(norte=points.latitude.map(mercator))
    plotted = map_points(points, clustered)
    fig = px.scatter(plotted, x="longitude", y="norte", color="Tipo",
                     hover_name="Nome", custom_data=["Membros"],
                     hover_data={"Localização": True, "Quantidade": True, "norte": False, "longitude": False},
                     size="Quantidade", size_max=25 if clustered else 9,
                     color_discrete_map=dict(zip(["Atração", "Restaurante", "Experiência"], COLORS)), height=MAP_HEIGHT)
    fig.update_traces(marker=dict(sizemin=6, opacity=.85, line=dict(width=.7, color="#08151e")))
    geography = json.loads(Path(__file__).with_name("region.geojson").read_text())
    for country in geography["features"]:
        for polygon in country["geometry"]["coordinates"]:
            ring = polygon[0]
            fig.add_trace(go.Scatter(
                x=[position[0] for position in ring], y=[mercator(position[1]) for position in ring],
                mode="lines", fill="toself", fillcolor="#142c36",
                line=dict(color="#567c87", width=1), hoverinfo="skip", showlegend=False,
            ))
    # Desenhar primeiro o território e depois os pontos, mantendo as legendas da oferta.
    point_traces = len(points.Tipo.unique())
    fig.data = fig.data[point_traces:] + fig.data[:point_traces]
    # A escala é igual nos dois eixos; o intervalo adapta-se à largura sem bandas vazias.
    fig.update_xaxes(visible=False, range=[-17, 7], constrain="range")
    fig.update_yaxes(visible=False, range=[mercator(40) - 8, mercator(40) + 8],
                     scaleanchor="x", scaleratio=1, constrain="range")
    fig.update_layout(margin=dict(l=0, r=0, t=30, b=0), dragmode="pan",
                      legend=dict(orientation="h", y=1.05, x=0))
    fig.update_layout(clickmode="event+select", uirevision=key)
    if labels:
        names = points.groupby("Localização").agg(longitude=("longitude", "median"), norte=("norte", "median"), total=("Chave", "count")).nlargest(6, "total")
        for name, place in names.iterrows():
            fig.add_annotation(x=place.longitude, y=place.norte, text=escape_plot_text(name),
                               showarrow=False, xshift=12, yshift=12,
                               font=dict(color="#e3d9be", size=11), bgcolor="rgba(16,33,45,.8)")
    event = chart(fig, map_controls=True, key=key)
    st.caption(f"{len(points)} de {len(frame)} registos com coordenadas válidas. Base cartográfica: Natural Earth (domínio público), Europa e norte de África. Use +/− ou a roda do rato para aproximar; arraste para deslocar. Experiências sem coordenadas ficam na lista.")
    st.caption("Clique num ponto para abrir a ficha. Num grupo, escolha o registo. O agrupamento é aproximado e pode ser desligado para ver pontos individuais.")
    selected = event.selection.points if event else []
    valid = set(frame.Chave)
    for point in selected:
        custom = point.get("customdata")
        if custom:
            return [member for member in json.loads(custom[0]) if member in valid]
    return []



def map_points(points: pd.DataFrame, clustered: bool) -> pd.DataFrame:
    """Guardar os membros de cada ponto sem confundir índices de traços e de catálogo."""
    rows = points.copy()
    rows["Membros"] = rows.Chave.map(lambda key: json.dumps([key]))
    rows["Quantidade"] = 1
    if not clustered:
        return rows
    rows["grelha_x"] = rows.longitude.round(1)
    rows["grelha_y"] = rows.latitude.round(1)
    grouped = []
    for _, group in rows.groupby(["Tipo", "grelha_x", "grelha_y"], sort=False):
        row = group.iloc[0].copy()
        row["longitude"] = group.longitude.mean()
        row["norte"] = group.norte.mean()
        row["Membros"] = json.dumps(group.Chave.tolist())
        row["Quantidade"] = len(group)
        if len(group) > 1:
            row["Nome"] = f"{len(group)} registos próximos"
            row["Localização"] = " / ".join(sorted(group.Localização.dropna().unique()))
        grouped.append(row)
    return pd.DataFrame(grouped)


def display_value(value) -> str:
    return str(value) if pd.notna(value) and str(value).strip() else "Por confirmar"


def historical_mentions(row: pd.Series) -> pd.DataFrame:
    """Usar apenas a relação explícita de atração; não inferir ligações por semelhança."""
    if row.Tipo != "Atração":
        return pd.DataFrame()
    return query("""SELECT DISTINCT id_roteiro AS Roteiro, codigo_fonte AS 'Código da fonte',
                 pagina AS Página FROM structured_atividades WHERE id_atracao_base = ?
                 ORDER BY id_roteiro, pagina""", (str(row.Identificador),))


def record_detail(row: pd.Series) -> None:
    with st.container(border=True):
        st.subheader(str(row.Nome))
        for field in ("Tipo", "Localização", "Categoria", "Descrição", "Duração", "Horário", "Preço", "Condições", "Acessibilidade", "Fonte"):
            st.text(f"{field}: {display_value(row[field])}")
        source = display_value(row.Fonte).strip()
        try:
            parsed = urlsplit(source)
            if parsed.scheme in ("https", "http") and parsed.hostname and not any(char.isspace() for char in source):
                st.link_button("Consultar fonte", source)
        except ValueError:
            pass  # Uma fonte textual ou URL inválida continua visível na ficha.
        st.caption("Referência de catálogo. Durações podem ser estimativas; confirmar preços, condições e acessibilidade antes de apresentar ao cliente.")
        mentions = historical_mentions(row)
        if row.Tipo != "Atração":
            st.info("Esta entidade não dispõe de uma relação explícita com o catálogo no histórico. Não foi inferida uma correspondência pelo nome.")
        elif mentions.empty:
            st.caption("Sem menções ligadas pelo identificador no histórico disponível. Isto não demonstra ausência de procura.")
        else:
            st.metric("Presença no histórico", mentions.Roteiro.nunique(), help="Roteiros distintos com relação explícita a esta atração; não representa vendas.")
            st.dataframe(mentions, hide_index=True, width="stretch")


def show_selection(frame: pd.DataFrame, selected: list[str], *, key: str) -> None:
    options = frame.Chave.tolist()
    # Aplicar um novo clique apenas uma vez, sem sobrepor escolhas posteriores na ficha.
    signature = tuple(selected)
    if signature and signature != st.session_state.get(f"{key}_last_click"):
        st.session_state[f"{key}_last_click"] = signature
        st.session_state[key] = selected[0]
    if st.session_state.get(key) not in options:
        st.session_state[key] = options[0]
    if len(selected) > 1:
        st.caption(f"Ponto com {len(selected)} registos. Escolha qual abrir:")
        member = st.selectbox("Registos deste ponto", selected,
                              format_func=lambda value: str(frame.loc[frame.Chave == value, "Nome"].iloc[0]), key=f"{key}_members")
        if member != st.session_state.get(f"{key}_member_previous"):
            st.session_state[key] = member
            st.session_state[f"{key}_member_previous"] = member
    chosen = st.selectbox("Abrir ficha", options, key=key,
                          format_func=lambda value: " · ".join(frame.loc[frame.Chave == value, ["Nome", "Tipo"]].iloc[0]))
    record_detail(frame.loc[frame.Chave == chosen].iloc[0])


def comparison(frame: pd.DataFrame) -> None:
    st.subheader("Colocar opções lado a lado")
    indexed = frame.set_index("Chave")
    chosen = st.multiselect("Comparar entre 2 e 4 opções", indexed.index.tolist(), max_selections=4,
                            format_func=lambda value: f"{indexed.at[value, 'Nome']} · {indexed.at[value, 'Tipo']}")
    if len(chosen) < 2:
        st.caption("Selecione pelo menos duas opções da seleção atual.")
        return
    fields = ["Tipo", "Localização", "Categoria", "Duração", "Horário", "Preço", "Condições", "Acessibilidade", "Fonte"]
    table = indexed.loc[chosen, fields].map(display_value).T
    table.columns = [f"{indexed.at[value, 'Nome']} · {indexed.at[value, 'Tipo']}" for value in chosen]
    st.dataframe(table, width="stretch")
    st.caption("Comparação descritiva. Unidades, condições e confirmação comercial podem ser diferentes; não existe uma classificação automática de melhor opção.")


def review_items(frame: pd.DataFrame) -> pd.DataFrame:
    """Prioridades explícitas e descritivas, sem transformar desconhecidos em certezas."""
    items = []
    for _, row in frame.iterrows():
        for field in ("Duração", "Horário", "Preço", "Condições", "Acessibilidade", "Fonte"):
            value = display_value(row[field])
            if value == "Por confirmar" or any(term in value.casefold() for term in ("por confirmar", "a confirmar", "reconfirmar", "a validar", "não confirmad")):
                items.append({"Prioridade": "1 · Condições comerciais" if field in ("Preço", "Condições") else "2 · Informação operacional",
                              "Nome": row.Nome, "Tipo": row.Tipo, "Campo": field,
                              "Motivo": value, "Fonte": display_value(row.Fonte), "Chave": row.Chave})
    return pd.DataFrame(items, columns=["Prioridade", "Nome", "Tipo", "Campo", "Motivo", "Fonte", "Chave"])


def review_queue(frame: pd.DataFrame) -> None:
    st.subheader("Revisão prioritária do catálogo")
    items = review_items(frame)
    if items.empty:
        st.info("Não foram encontradas lacunas ou expressões de confirmação nos campos analisados. Isto não certifica a informação.")
        return
    field = st.selectbox("Campo a rever", ["Todos"] + sorted(items.Campo.unique()))
    if field != "Todos":
        items = items[items.Campo == field]
    items = items.sort_values(["Prioridade", "Nome", "Campo"])
    st.caption(f"{len(items)} campos em {items.Chave.nunique()} registos. Prioridade definida por campo; sem prazo de validade inferido.")
    st.dataframe(items.drop(columns="Chave"), width="stretch", hide_index=True)
    selected = st.selectbox("Abrir registo para revisão", items.Chave.drop_duplicates().tolist(),
                            format_func=lambda value: str(frame.loc[frame.Chave == value, "Nome"].iloc[0]))
    record_detail(frame.loc[frame.Chave == selected].iloc[0])


def destinations(frame: pd.DataFrame) -> None:
    heading("03 — TERRITÓRIO", "Um destino, muitas perspetivas.", "Explore a profundidade da oferta e as referências que ainda precisam de revisão.")
    place = st.selectbox("Destino / localização registada", sorted(frame.Localização.dropna().unique()))
    subset = frame[frame.Localização == place]
    counts = subset.Tipo.value_counts()
    metrics([(kind.upper(), int(counts.get(kind, 0)), "registos nesta localização") for kind in ("Atração", "Restaurante", "Experiência")])
    st.caption("Correspondência exata com a localização da fonte. Experiências descritas por região ou por vários lugares não são atribuídas automaticamente a uma cidade.")
    selected = map_chart(subset, key="destination_map")
    a, b = st.columns(2)
    with a:
        categories = subset.groupby(["Categoria", "Tipo"]).size().reset_index(name="Registos")
        top = categories.groupby("Categoria").Registos.sum().nlargest(10).index
        categories = categories[categories.Categoria.isin(top)]
        st.caption("As dez categorias com mais registos nesta localização.")
        chart(px.bar(categories, x="Registos", y="Categoria", color="Tipo", orientation="h", color_discrete_sequence=COLORS))
    with b:
        pending = review_items(subset)
        st.metric("Registos com campos a rever", pending.Chave.nunique())
        st.caption("Lacunas ou texto de confirmação nos campos analisados; não corresponde a uma auditoria de toda a informação.")
        st.dataframe(pending[["Nome", "Campo", "Motivo"]], width="stretch", hide_index=True)
    show_selection(subset, selected, key="destination_detail")
    comparison(subset)


def overview(frame: pd.DataFrame, validation: dict) -> None:
    heading("01 — PANORAMA", "Um território de possibilidades.",
            "A oferta BLU, as suas referências e o conhecimento que ainda podemos aprofundar.")
    counts = frame.Tipo.value_counts()
    metrics([(kind.upper(), int(counts.get(kind, 0)), "registos no catálogo") for kind in ("Atração", "Restaurante", "Experiência")]
            + [("ACERVO", len(query("SELECT document_id FROM proposal_documents")), "documentos PDF históricos")])
    options = map_options(key="overview_map")
    left, right = st.columns([1.8, 1], gap="large")
    with left:
        st.subheader("A geografia da curadoria")
        selected = map_chart(frame, key="overview_map", options=options)
        if selected:
            show_selection(frame, selected, key="overview_detail")
    with right:
        st.subheader("Oferta por localização")
        cities = frame[frame.Tipo != "Experiência"].groupby(["Localização", "Tipo"]).size().reset_index(name="Registos")
        top = cities.groupby("Localização").Registos.sum().nlargest(8).index
        chart(px.bar(cities[cities.Localização.isin(top)], x="Registos", y="Localização", color="Tipo",
                     orientation="h", color_discrete_sequence=COLORS, height=MAP_HEIGHT))
        st.caption("Top 8 das localizações registadas em atrações e restaurantes. As experiências usam descrições de localização distintas e são exploradas separadamente.")
    st.divider()
    st.subheader("O próximo passo começa nos dados")
    metrics([("INTEGRIDADE", validation["issue_count"], "ocorrências nos controlos do ETL"),
             ("PREÇOS A REVER", len(query("SELECT id FROM precos WHERE preco_publico_vs_custo = 'Referência anterior — validar'")), "referências anteriores assinaladas"),
             ("CONFLITOS DE FONTES", len(query("SELECT record_id FROM structured_merge_conflicts")), "divergências conservadas para revisão")])
    st.caption("Integridade técnica e campos preenchidos não equivalem a disponibilidade, aprovação ou informação comercial confirmada.")


def explore(frame: pd.DataFrame) -> None:
    heading("02 — EXPLORAR", "Encontre a próxima descoberta.", "Cruze lugares, sabores e experiências. Abra um registo para conhecer o seu contexto.")
    a, b, c = st.columns(3)
    kinds = a.multiselect("Tipo de oferta", sorted(frame.Tipo.unique()))
    subset = frame[frame.Tipo.isin(kinds)] if kinds else frame
    places = b.multiselect("Localização registada", sorted(subset.Localização.dropna().unique()))
    if places:
        subset = subset[subset.Localização.isin(places)]
    categories = c.multiselect("Categoria", sorted(subset.Categoria.dropna().unique()))
    if categories:
        subset = subset[subset.Categoria.isin(categories)]
    search = st.text_input("Pesquisar nome ou descrição", placeholder="Ex.: azulejo, vinho, Sintra…")
    if search:
        subset = subset[subset[["Nome", "Descrição"]].fillna("").apply(lambda col: col.str.contains(search, case=False, regex=False)).any(axis=1)]
    st.caption(f"{len(subset)} de {len(frame)} registos · localizações e categorias preservam as designações das fontes")
    options = map_options(key="explore_map")
    left, right = st.columns([1.5, 1])
    with left:
        selected_keys = map_chart(subset, key="explore_map", options=options)
    with right:
        st.dataframe(subset[["Nome", "Tipo", "Localização", "Categoria"]], hide_index=True, width="stretch", height=MAP_HEIGHT)
    if subset.empty:
        st.info("Nenhum resultado. Experimente retirar um filtro.")
        return
    show_selection(subset, selected_keys, key="explore_detail")
    comparison(subset)


def pricing() -> None:
    heading("04 — REFERÊNCIAS", "Cada preço tem um contexto.", "Compare apenas referências com a mesma categoria, unidade e natureza comercial declarada.")
    frame = query("SELECT categoria AS Categoria, nome_modalidade AS Modalidade, local AS Local, unidade AS Unidade, preco_referencia_eur AS 'Referência EUR', preco_publico_vs_custo AS Natureza, estado AS Estado, fonte AS Fonte, data_de_verificacao AS Verificação FROM precos")
    metrics([("REFERÊNCIAS", len(frame), "registos de preço; não ofertas únicas"),
             ("COM VALOR", int(frame['Referência EUR'].notna().sum()), "valores de referência em EUR"),
             ("SEM VALOR", int(frame['Referência EUR'].isna().sum()), "desconhecido não significa zero")])
    a, b, c = st.columns(3)
    category = a.selectbox("Categoria", sorted(frame.Categoria.dropna().unique()))
    subset = frame[frame.Categoria == category]
    unit = b.selectbox("Unidade declarada", sorted(subset.Unidade.dropna().unique()))
    subset = subset[subset.Unidade == unit]
    nature = c.selectbox("Natureza comercial", sorted(subset.Natureza.dropna().unique()))
    subset = subset[subset.Natureza == nature]
    values = subset.dropna(subset=["Referência EUR"])
    if not values.empty:
        st.metric("Mediana da seleção · EUR", f"{values['Referência EUR'].median():.2f}")
        chart(px.box(values, y="Referência EUR", points="all", hover_name="Modalidade", color_discrete_sequence=COLORS))
    else:
        st.info("Esta seleção não tem valores numéricos de referência.")
    st.dataframe(subset, hide_index=True, width="stretch")
    st.caption("A mesma unidade pode ter condições diferentes. Valores públicos, custos e referências por validar não constituem uma cotação nem permitem calcular margens.")


def history() -> None:
    heading("05 — MEMÓRIA", "Conhecimento que merece continuar.", "Explore a presença de atividades nos roteiros estruturados, sem a confundir com vendas ou satisfação.")
    counts = query("SELECT COUNT(*) AS total, SUM(data_explicita IS NOT NULL AND TRIM(data_explicita) != '') AS dated FROM structured_roteiros").iloc[0]
    metrics([("ROTEIROS", int(counts.total), "registos estruturados"),
             ("PDF HISTÓRICOS", len(query("SELECT document_id FROM proposal_documents")), "documentos; contagem distinta dos roteiros"),
             ("COM DATA EXPLÍCITA", int(counts.dated or 0), "cobertura insuficiente para evolução temporal")])
    cities = query("SELECT cidade_da_base AS Localização, nome_etapa AS Atividade, id_roteiro FROM structured_atividades")
    place = st.selectbox("Localização no histórico", ["Todas"] + sorted(cities.Localização.dropna().unique()))
    if place != "Todas":
        cities = cities[cities.Localização == place]
    ranked = cities.groupby("Atividade").id_roteiro.nunique().nlargest(12).sort_values().reset_index(name="Roteiros")
    chart(px.bar(ranked, x="Roteiros", y="Atividade", orientation="h", color_discrete_sequence=COLORS, height=480))
    st.caption("Número de roteiros distintos onde a atividade é mencionada. A ausência de uma menção não demonstra ausência de procura.")
    st.dataframe(ranked.sort_values("Roteiros", ascending=False), hide_index=True, width="stretch")


def quality(validation: dict) -> None:
    heading("06 — CONFIANÇA", "Saber o que ainda não sabemos.", "A qualidade começa por distinguir integridade, preenchimento e confirmação da informação.")
    if validation["status"] == "passed":
        st.success("A entrega passou os controlos de integridade declarados pelo ETL.")
    else:
        st.warning("A entrega tem ocorrências de validação a consultar.")
    st.info("O indicador anterior de prontidão media apenas campos não nulos. Não é uma certificação de disponibilidade, acessibilidade ou preço confirmado.")
    gaps = [{"Tabela": table, "Campo": field, "Em falta": count, "Registos": details["record_count"]}
            for table, details in validation["tables"].items()
            for field, count in details["missing_values_by_column"].items() if count]
    if gaps:
        frame = pd.DataFrame(gaps)
        frame["Em falta %"] = (100 * frame['Em falta'] / frame.Registos).round(1)
        st.subheader("Lacunas declaradas na entrega")
        st.dataframe(frame.sort_values("Em falta", ascending=False), hide_index=True, width="stretch")
        st.caption("As tabelas estruturadas e o catálogo são camadas distintas; não somar estas lacunas como entidades únicas. Texto como «por confirmar» também exige revisão, mesmo estando preenchido.")
    review_queue(catalog_data())
    st.subheader("Fila de revisão de preços")
    pending = query("SELECT nome_modalidade AS Modalidade, local AS Local, preco_publico_vs_custo AS Motivo, fonte AS Fonte FROM precos WHERE preco_publico_vs_custo = 'Referência anterior — validar'")
    st.dataframe(pending, hide_index=True, width="stretch")
    st.subheader("Divergências entre fontes")
    conflicts = query('SELECT "table" AS Tabela, record_id AS Registo, field AS Campo FROM structured_merge_conflicts')
    st.dataframe(conflicts, hide_index=True, width="stretch")
    st.caption("Valores das fontes preservados no warehouse. Este dashboard não edita nem resolve divergências.")
    with st.expander("Controlos técnicos por tabela"):
        st.dataframe(pd.DataFrame([{"Tabela": name, "Registos": row["record_count"], "Preenchimento %": row["completeness_pct"], "Chaves em falta": row["missing_primary_keys"], "Chaves duplicadas": row["duplicate_primary_key_values"]} for name, row in validation["tables"].items()]), hide_index=True, width="stretch")
    with st.expander("Modelo de dados e metodologia"):
        st.markdown((ROOT / "reports" / "data_model_report.md").read_text(encoding="utf-8"))


def main() -> None:
    st.set_page_config(page_title="BLU · Observatório", page_icon="◈", layout="wide")
    style()
    if not DATABASE.exists():
        st.error("Entrega warehouse ausente. Consulte as instruções de instalação antes de executar o ETL.")
        st.stop()
    presentation = st.toggle("Modo apresentação", key="presentation")
    pages = ["Panorama", "Explorar oferta", "Destinos", "Preços", "Histórico", "Qualidade"]
    with st.sidebar:
        st.markdown('<div class="brand">BLU<span>INTELLIGENCE ATLAS</span></div>', unsafe_allow_html=True)
        st.caption("CURADORIA · TERRITÓRIO · CONHECIMENTO")
        page = st.radio("Navegação", pages, label_visibility="collapsed")
        st.divider()
        st.caption("FONTE / ENTREGA ETL")
        st.write("Conhecimento para decidir melhor.")
        st.caption("Consulta só de leitura. Sem chamadas a fornecedores de IA.")
    if presentation:
        st.markdown('<style>[data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"] {display:none;} .block-container {max-width:none;}</style>', unsafe_allow_html=True)
        page = st.pills("Área em apresentação", pages, default=page, key="presentation_page") or page
    frame = catalog_data()
    validation = load_json("validation_report.json")
    {"Panorama": lambda: overview(frame, validation), "Explorar oferta": lambda: explore(frame),
     "Destinos": lambda: destinations(frame), "Preços": pricing, "Histórico": history, "Qualidade": lambda: quality(validation)}[page]()
    st.divider()
    st.caption("BLU / OBSERVATÓRIO DE DADOS     ·     Referências para curadoria, sujeitas a confirmação humana.")


if __name__ == "__main__":
    main()
