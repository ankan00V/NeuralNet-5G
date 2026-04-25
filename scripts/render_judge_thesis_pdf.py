from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF


ROOT = Path(__file__).resolve().parents[1]
INPUT_MD = ROOT / "docs" / "NeuralNet5G_Judge_Thesis.md"
OUTPUT_PDF = ROOT / "docs" / "NeuralNet5G_Judge_Thesis.pdf"


class ThesisPDF(FPDF):
    def header(self) -> None:
        self.set_font("Helvetica", size=9)
        self.set_text_color(120)
        self.cell(0, 8, "NeuralNet5G | Judge Thesis", align="R")
        self.ln(10)
        self.set_text_color(0)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_font("Helvetica", size=9)
        self.set_text_color(140)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")
        self.set_text_color(0)


def _strip_md_inline(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    return text


def _normalize_for_core_fonts(text: str) -> str:
    # fpdf core fonts are latin-1; normalize common punctuation to ASCII.
    return (
        text.replace("\u2011", "-")  # non-breaking hyphen
        .replace("\u2013", "-")  # en dash
        .replace("\u2014", "-")  # em dash
        .replace("\u2212", "-")  # minus sign
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", "\"")
        .replace("\u201d", "\"")
        .replace("\u2192", "->")  # arrow
        .replace("\u2713", "OK")  # checkmark
        .replace("\u00a0", " ")  # nbsp
    )


def render(md_path: Path, pdf_path: Path) -> None:
    raw = md_path.read_text(encoding="utf-8")
    lines = raw.splitlines()

    pdf = ThesisPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()

    in_code = False

    for line in lines:
        # Keep x position stable; some multi_cell flows may leave x near the right margin.
        pdf.set_x(pdf.l_margin)

        if line.strip().startswith("```"):
            in_code = not in_code
            if not in_code:
                pdf.ln(2)
            continue

        if in_code:
            pdf.set_font("Courier", size=9)
            pdf.set_fill_color(245, 245, 245)
            pdf.multi_cell(0, 4.5, _normalize_for_core_fonts(line.rstrip("\n")), fill=True)
            continue

        if line.startswith("# "):
            pdf.set_font("Helvetica", style="B", size=18)
            pdf.ln(1)
            pdf.multi_cell(0, 8, _normalize_for_core_fonts(_strip_md_inline(line[2:].strip())))
            pdf.ln(1)
            continue

        if line.startswith("## "):
            pdf.set_font("Helvetica", style="B", size=14)
            pdf.ln(3)
            pdf.multi_cell(0, 7, _normalize_for_core_fonts(_strip_md_inline(line[3:].strip())))
            pdf.ln(1)
            continue

        if line.startswith("### "):
            pdf.set_font("Helvetica", style="B", size=12)
            pdf.ln(2)
            pdf.multi_cell(0, 6, _normalize_for_core_fonts(_strip_md_inline(line[4:].strip())))
            pdf.ln(0.5)
            continue

        stripped = line.strip()
        if not stripped:
            pdf.ln(3)
            continue

        if stripped == "---":
            y = pdf.get_y()
            pdf.set_draw_color(210)
            pdf.line(12, y, 198, y)
            pdf.set_draw_color(0)
            pdf.ln(5)
            continue

        if stripped.startswith(("- ", "* ")):
            text = _normalize_for_core_fonts(_strip_md_inline(stripped[2:].strip()))
            pdf.set_font("Helvetica", size=11)
            pdf.cell(5, 5, "-")
            pdf.multi_cell(0, 5.5, text)
            continue

        if re.match(r"^\d+\.\s+", stripped):
            pdf.set_font("Helvetica", size=11)
            pdf.multi_cell(0, 5.5, _normalize_for_core_fonts(_strip_md_inline(stripped)))
            continue

        pdf.set_font("Helvetica", size=11)
        pdf.multi_cell(0, 5.5, _normalize_for_core_fonts(_strip_md_inline(line)))

    pdf.output(str(pdf_path))


if __name__ == "__main__":
    if not INPUT_MD.exists():
        raise SystemExit(f"Missing markdown input: {INPUT_MD}")
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    render(INPUT_MD, OUTPUT_PDF)
    print(f"Wrote {OUTPUT_PDF}")
