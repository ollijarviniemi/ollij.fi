#!/usr/bin/env python3
"""Generate a full-page A4 score-sheet for the Aumann print PDF.

Columns:  Round (pre-filled 1..N) | Round 1 [P1 | P2] | Round 2 [P1 | P2] | Total
N round rows + a final "Total" row. Fills the page (small margins). Writes scoresheet.pdf.

Tune the CONSTANTS block for margins / line thickness; sizes derive from the page so it
always fills A4. merge_game_pdfs.py appends scoresheet.pdf if present.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

# ---------------- CONSTANTS (tune these) ----------------
ROUNDS     = 25
OUT        = "scoresheet.pdf"
TITLE      = "Score sheet"
MARGIN     = 9 * mm        # page margin (small — fill the page)
TITLE_BAND = 12 * mm       # vertical space reserved for the title
HEAD_H     = 30            # height of each of the 2 header rows (pt)
W_ROUND    = 22 * mm       # "Round" column width
W_TOTAL    = 30 * mm       # "Total" column width
GRID_W     = 0.5           # thin inner grid lines
HEAVY_W    = 1.3           # heavy lines: outer box, group dividers, header underline, total row
TITLE_SIZE = 18
HEAD_SIZE  = 12
CELL_SIZE  = 12
SHADE      = colors.Color(0.94, 0.94, 0.94)   # Total-row background
# --------------------------------------------------------

PAGE_W, PAGE_H = A4

def build_table():
    usable_w = PAGE_W - 2 * MARGIN
    usable_h = PAGE_H - 2 * MARGIN - TITLE_BAND
    n_data   = ROUNDS + 1                         # round rows + Total row
    data_h   = (usable_h - 2 * HEAD_H) / n_data
    w_player = (usable_w - W_ROUND - W_TOTAL) / 4

    data = [["Round", "Round 1", "", "Round 2", "", "Total"],
            ["", "P1", "P2", "P1", "P2", ""]]
    for i in range(1, ROUNDS + 1):
        data.append([str(i), "", "", "", "", ""])
    data.append(["Total", "", "", "", "", ""])
    total_r = len(data) - 1

    col_widths  = [W_ROUND, w_player, w_player, w_player, w_player, W_TOTAL]
    row_heights = [HEAD_H, HEAD_H] + [data_h] * n_data

    style = TableStyle([
        ("SPAN", (0, 0), (0, 1)), ("SPAN", (5, 0), (5, 1)),
        ("SPAN", (1, 0), (2, 0)), ("SPAN", (3, 0), (4, 0)),
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 1), HEAD_SIZE),
        ("FONTNAME", (0, 2), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 2), (-1, -1), CELL_SIZE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TEXTCOLOR", (0, 2), (0, total_r - 1), colors.Color(0.25, 0.25, 0.25)),
        # grid + heavy lines
        ("GRID", (0, 0), (-1, -1), GRID_W, colors.black),
        ("BOX", (0, 0), (-1, -1), HEAVY_W, colors.black),
        ("LINEBELOW", (0, 1), (-1, 1), HEAVY_W, colors.black),
        ("LINEAFTER", (0, 0), (0, -1), HEAVY_W, colors.black),
        ("LINEAFTER", (2, 0), (2, -1), HEAVY_W, colors.black),
        ("LINEAFTER", (4, 0), (4, -1), HEAVY_W, colors.black),
        # Total row: shaded, bold, heavy separator above
        ("BACKGROUND", (0, total_r), (-1, total_r), SHADE),
        ("FONTNAME", (0, total_r), (-1, total_r), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, total_r), (0, total_r), colors.black),
        ("LINEABOVE", (0, total_r), (-1, total_r), HEAVY_W, colors.black),
    ])
    t = Table(data, colWidths=col_widths, rowHeights=row_heights)
    t.setStyle(style)
    return t

def main():
    c = canvas.Canvas(OUT, pagesize=A4)
    t = build_table()
    tw, th = t.wrapOn(c, PAGE_W, PAGE_H)
    x = MARGIN + (PAGE_W - 2 * MARGIN - tw) / 2
    c.setFont("Helvetica-Bold", TITLE_SIZE)
    c.drawCentredString(PAGE_W / 2, PAGE_H - MARGIN - TITLE_BAND + 4 * mm, TITLE)
    t.drawOn(c, x, MARGIN)
    c.showPage()
    c.save()
    print(f"wrote {OUT} ({ROUNDS} rounds + Total row, full A4)")

if __name__ == "__main__":
    main()
