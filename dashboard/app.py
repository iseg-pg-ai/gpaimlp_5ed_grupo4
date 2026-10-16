"""Observatório BLU: exploração só de leitura da entrega publicada pelo ETL."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE = ROOT / "warehouse"
DATABASE = WAREHOUSE / "blu_etl.sqlite"
COLORS = ["#66e5cf", "#d8b776", "#799dff"]


def query(sql: str) -> pd.DataFrame:
    """Ler a entrega publicada, sem cache que sobreviva a uma nova publicação."""
    with sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True) as connection:
        return pd.read_sql_query(sql, connection)


def load_json(name: str) -> dict:
    return json.loads((WAREHOUSE / name).read_text(encoding="utf-8"))


def catalog_data() -> pd.DataFrame:
    return query("""
        SELECT id AS Identificador, 'Atração' AS Tipo, nome_da_atracao AS Nome,
        cidade AS Localização, categoria AS Categoria, descricao_curada AS Descrição,
        latitude, longitude, horario AS Horário, preco_da_atracao AS Preço,
        site_fonte AS Fonte FROM atracoes
        UNION ALL
        SELECT id_blu, 'Restaurante', estabelecimento, cidade, tipo_gastronomia_base,
        observacoes_da_base, latitude, longitude, horario_base_reconfirmar,
        preco_nao_cotacao, fonte_indicada_na_base FROM restaurantes
        UNION ALL
        SELECT nome_da_experiencia, 'Experiência', nome_da_experiencia, localizacao,
        categoria, descricao, NULL, NULL, horario, preco, site_fonte FROM experiencias
    """)


def style() -> None:
    st.markdown((Path(__file__).with_name("style.css")).read_text(), unsafe_allow_html=True)


def heading(number: str, title: str, description: str) -> None:
    st.caption(f"OBSERVATÓRIO BLU / {number}")
    st.title(title)
    st.write(description)


def chart(fig) -> None:
    fig.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)",
                      plot_bgcolor="rgba(0,0,0,0)", font=dict(color="#b5c6d2", family="sans-serif"),
                      margin=dict(l=0, r=12, t=30, b=0), legend_title_text="", legend=dict(font=dict(color="#b5c6d2")),
                      colorway=COLORS)
    fig.update_xaxes(gridcolor="#1d303d", zeroline=False)
    fig.update_yaxes(gridcolor="#1d303d", zeroline=False)
    st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})


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


def map_chart(frame: pd.DataFrame) -> None:
    points = located(frame)
    if points.empty:
        st.info("Não existem coordenadas válidas nesta seleção.")
        return
    # Projeção local sem fornecedor de mosaicos nem pedidos a serviços de mapas.
    fig = px.scatter_geo(points, lat="latitude", lon="longitude", color="Tipo",
                         hover_name="Nome", hover_data={"Localização": True, "latitude": False, "longitude": False},
                         color_discrete_sequence=COLORS, projection="mercator", height=490)
    fig.update_traces(marker=dict(size=9, opacity=.8, line=dict(width=.7, color="#08151e")))
    fig.update_geos(fitbounds="locations", visible=False, bgcolor="rgba(0,0,0,0)")
    # Sem contornos geográficos: evita dependência externa dos ficheiros topojson.
    chart(fig)
    st.caption(f"{len(points)} de {len(frame)} registos com coordenadas válidas. Vista geográfica sem mapa-base; experiências sem coordenadas ficam na lista.")


def overview(frame: pd.DataFrame, validation: dict) -> None:
    heading("01 — PANORAMA", "Um território de possibilidades.",
            "A oferta BLU, as suas referências e o conhecimento que ainda podemos aprofundar.")
    counts = frame.Tipo.value_counts()
    metrics([(kind.upper(), int(counts.get(kind, 0)), "registos no catálogo") for kind in ("Atração", "Restaurante", "Experiência")]
            + [("ACERVO", len(query("SELECT document_id FROM proposal_documents")), "documentos PDF históricos")])
    left, right = st.columns([1.25, 1], gap="large")
    with left:
        st.subheader("A geografia da curadoria")
        map_chart(frame)
    with right:
        st.subheader("Onde a oferta se concentra")
        cities = frame[frame.Tipo != "Experiência"].groupby(["Localização", "Tipo"]).size().reset_index(name="Registos")
        top = cities.groupby("Localização").Registos.sum().nlargest(8).index
        chart(px.bar(cities[cities.Localização.isin(top)], x="Registos", y="Localização", color="Tipo",
                     orientation="h", color_discrete_sequence=COLORS, height=390))
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
    left, right = st.columns([1.1, 1])
    with left:
        map_chart(subset)
    with right:
        st.dataframe(subset[["Nome", "Tipo", "Localização", "Categoria"]], hide_index=True, width="stretch", height=390)
    if subset.empty:
        st.info("Nenhum resultado. Experimente retirar um filtro.")
        return
    selected = st.selectbox("Abrir ficha", subset.index, format_func=lambda i: f"{subset.at[i, 'Nome']} · {subset.at[i, 'Tipo']}")
    row = subset.loc[selected]
    with st.container(border=True):
        st.subheader(str(row.Nome))
        for field in ("Tipo", "Localização", "Categoria", "Descrição", "Horário", "Preço", "Fonte"):
            st.text(f"{field}: {row[field] if pd.notna(row[field]) else 'Por confirmar'}")
        st.caption("Referência de catálogo. Confirmar condições antes de apresentar ao cliente.")


def pricing() -> None:
    heading("03 — REFERÊNCIAS", "Cada preço tem um contexto.", "Compare apenas referências com a mesma categoria, unidade e natureza comercial declarada.")
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
    heading("04 — MEMÓRIA", "Conhecimento que merece continuar.", "Explore a presença de atividades nos roteiros estruturados, sem a confundir com vendas ou satisfação.")
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
    heading("05 — CONFIANÇA", "Saber o que ainda não sabemos.", "A qualidade começa por distinguir integridade, preenchimento e confirmação da informação.")
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
    with st.sidebar:
        st.markdown('<div class="brand">BLU<span>INTELLIGENCE ATLAS</span></div>', unsafe_allow_html=True)
        st.caption("CURADORIA · TERRITÓRIO · CONHECIMENTO")
        page = st.radio("Navegação", ["Panorama", "Explorar oferta", "Preços", "Histórico", "Qualidade"], label_visibility="collapsed")
        st.divider()
        st.caption("FONTE / ENTREGA ETL")
        st.write("Conhecimento para decidir melhor.")
        st.caption("Consulta só de leitura. Sem chamadas a fornecedores de IA.")
    frame = catalog_data()
    validation = load_json("validation_report.json")
    {"Panorama": lambda: overview(frame, validation), "Explorar oferta": lambda: explore(frame),
     "Preços": pricing, "Histórico": history, "Qualidade": lambda: quality(validation)}[page]()
    st.divider()
    st.caption("BLU / OBSERVATÓRIO DE DADOS     ·     Referências para curadoria, sujeitas a confirmação humana.")


if __name__ == "__main__":
    main()
