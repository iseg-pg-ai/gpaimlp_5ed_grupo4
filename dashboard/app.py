"""Interactive Streamlit dashboard for the local BLU ETL warehouse."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st


# Resolve paths from the repository root so the app also works when launched elsewhere.
ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE = ROOT / "warehouse"
DATABASE = WAREHOUSE / "blu_etl.sqlite"


@st.cache_data(show_spinner=False)
def query(sql: str) -> pd.DataFrame:
    """Run a read-only dashboard query against the generated SQLite warehouse."""
    with sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True) as connection:
        return pd.read_sql_query(sql, connection)


@st.cache_data(show_spinner=False)
def load_json(name: str) -> dict:
    """Load one small ETL report artifact for cards and explanatory content."""
    return json.loads((WAREHOUSE / name).read_text(encoding="utf-8"))


def section_header(title: str, description: str) -> None:
    """Render a consistently styled dashboard section heading."""
    st.header(title)
    st.caption(description)


def overview(kpis: dict, validation: dict) -> None:
    """Show the headline operational and data-quality metrics."""
    section_header("Warehouse overview", "Metrics are calculated after ETL validation.")
    catalog, proposals = kpis["catalog"], kpis["proposals"]
    cards = st.columns(6)
    cards[0].metric("Attractions", catalog["attractions"])
    cards[1].metric("Restaurants", catalog["restaurants"])
    cards[2].metric("Experiences", catalog["experiences"])
    cards[3].metric("Cities", catalog["distinct_cities"])
    cards[4].metric("Proposal PDFs", proposals["documents"])
    cards[5].metric("Validation issues", validation["issue_count"])

    city_data = pd.DataFrame(kpis["catalog"]["records_by_city"].items(), columns=["City", "Records"])
    st.plotly_chart(px.bar(city_data, x="City", y="Records", title="Catalog records by city"), use_container_width=True)


def quality(validation: dict) -> None:
    """Show table-level completeness and optional-field gaps from validation."""
    section_header("Data validation", "Validation checks entity keys, coordinates, and PDF-page relationships.")
    st.success("Validation passed with no integrity issues." if validation["status"] == "passed" else "Validation completed with warnings.")
    rows = []
    for table, details in validation["tables"].items():
        rows.append({"Table": table, "Records": details["record_count"], "Completeness %": details["completeness_pct"], "Missing key values": details["missing_primary_keys"], "Duplicate key values": details["duplicate_primary_key_values"]})
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    gaps = [{"Table": table, "Field": field, "Missing values": count} for table, details in validation["tables"].items() for field, count in details["missing_values_by_column"].items()]
    if gaps:
        st.plotly_chart(px.bar(pd.DataFrame(gaps), x="Field", y="Missing values", color="Table", title="Optional-field completeness gaps"), use_container_width=True)


def catalog(kpis: dict) -> None:
    """Explore experience mix and operational readiness of catalog records."""
    section_header("Catalog and readiness", "Readiness scores identify which records are most prepared for itinerary curation.")
    categories = pd.DataFrame(kpis["catalog"]["experiences_by_category"].items(), columns=["Experience category", "Records"])
    st.plotly_chart(px.bar(categories, x="Experience category", y="Records", title="Experiences by category"), use_container_width=True)
    # Quote the ETL's `table` field because TABLE is reserved SQL syntax in SQLite.
    readiness = query('SELECT "table" AS source_table, readiness_level, COUNT(*) AS records, ROUND(AVG(readiness_score), 2) AS average_score FROM model_catalog_readiness GROUP BY "table", readiness_level ORDER BY "table", readiness_level')
    st.dataframe(readiness, use_container_width=True, hide_index=True)


def pricing(kpis: dict) -> None:
    """Display price-reference distribution by business category."""
    section_header("Pricing", "Reference prices are descriptive inputs, not customer quotations.")
    rows = [{"Category": category, **stats} for category, stats in kpis["pricing"]["by_category"].items()]
    frame = pd.DataFrame(rows)
    st.dataframe(frame, use_container_width=True, hide_index=True)
    st.plotly_chart(px.bar(frame, x="Category", y="mean_eur", error_y=None, title="Mean reference price (EUR)"), use_container_width=True)


def proposals(kpis: dict) -> None:
    """Show extracted proposal volume and the transparent complexity score."""
    section_header("Proposal corpus", "Complexity is normalized from page count, text volume, and price mentions.")
    details = kpis["proposals"]
    st.write(f"{details['documents']} documents / {details['pages']} pages / {details['total_text_characters']:,} extracted characters")
    complexity = query("SELECT file_name, complexity_score, complexity_level, page_count, text_characters, price_mentions FROM model_proposal_complexity ORDER BY complexity_score DESC")
    st.plotly_chart(px.scatter(complexity, x="page_count", y="text_characters", color="complexity_level", hover_name="file_name", size="price_mentions", title="Proposal complexity"), use_container_width=True)
    st.dataframe(complexity, use_container_width=True, hide_index=True)


def data_model_report() -> None:
    """Render the companion report that documents warehouse modeling decisions."""
    section_header("Data model report", "Entity grain, identifiers, lineage, and relationships in the analytical warehouse.")
    st.markdown((ROOT / "reports" / "data_model_report.md").read_text(encoding="utf-8"))


def main() -> None:
    """Configure the page and route each navigation selection to its view."""
    st.set_page_config(page_title="BLU Data Warehouse", page_icon="🧭", layout="wide")
    st.title("BLU Data Warehouse Dashboard")
    if not DATABASE.exists():
        st.error("Warehouse not found. Run `python -m etl.pipeline` first.")
        st.stop()
    kpis, validation = load_json("kpis.json"), load_json("validation_report.json")
    page = st.sidebar.radio("Dashboard", ["Overview", "Data validation", "Catalog", "Pricing", "Proposals", "Data model report"])
    {"Overview": lambda: overview(kpis, validation), "Data validation": lambda: quality(validation), "Catalog": lambda: catalog(kpis), "Pricing": lambda: pricing(kpis), "Proposals": lambda: proposals(kpis), "Data model report": data_model_report}[page]()


if __name__ == "__main__":
    main()
