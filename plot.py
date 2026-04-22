# ── colour scheme ──────────────────────────────────────────────────────────────
COLORS = {
    "synteny": "#378ADD",
    "inversion": "#BA7517",
    "translocation": "#639922",
    "chr_track": "#D3D1C7",
    "gene_base": "#185FA5",
}


# ── helpers ───────────────────────────────────────────────────────────────────
def chr_x_offset(chroms, chrom_lengths, gap=5):
    """Return {chr: x_start} dict given ordered chrom list and their lengths."""
    offsets, x = {}, 0
    for c in chroms:
        offsets[c] = x
        x += chrom_lengths[c] + gap
    return offsets


def draw_chromosome(ax, y, x_start, length, label, height=1.5):
    """Rounded rectangle for a chromosome track."""
    ax.barh(
        y,
        length,
        left=x_start,
        height=height,
        color=COLORS["chr_track"],
        edgecolor="#888780",
        linewidth=0.5,
        align="center",
        capstyle="round",
    )  # requires matplotlib ≥ 3.7
    ax.text(x_start + length / 2, y, label, ha="center", va="center", fontsize=8, color="#444441")


def draw_gene(ax, y, x_start, length, color, alpha=0.9, height=1.5):
    rect = mpatches.FancyBboxPatch(
        (x_start, y - height / 2),
        length,
        height,
        boxstyle="round,pad=0.3",
        facecolor=color,
        edgecolor="white",
        linewidth=0.4,
        zorder=3,
    )
    ax.add_patch(rect)


def bezier_ribbon(ax, x0a, x0b, x1a, x1b, y_top, y_bot, color, alpha=0.2):
    """
    Draw a filled Bézier ribbon between two genome tracks.
    (x0a, x0b) = left/right edges of the gene in the TOP genome
    (x1a, x1b) = left/right edges of the gene in the BOTTOM genome
    Crossing x1a > x1b signals an inversion (start/end are swapped in data).
    """
    # control-point y is midway between the two tracks
    cy = (y_top + y_bot) / 2

    verts = [
        (x0a, y_top),
        (x0a, cy),
        (x1a, cy),
        (x1a, y_bot),  # left edge
        (x1b, y_bot),
        (x1b, cy),
        (x0b, cy),
        (x0b, y_top),  # right edge
        (x0a, y_top),  # close
    ]
    codes = [
        Path.MOVETO,
        Path.CURVE4,
        Path.CURVE4,
        Path.CURVE4,
        Path.LINETO,
        Path.CURVE4,
        Path.CURVE4,
        Path.CURVE4,
        Path.CLOSEPOLY,
    ]

    path = Path(verts, codes)
    patch = patches.PathPatch(path, facecolor=color, edgecolor=color, alpha=alpha, linewidth=0.6, zorder=2)
    ax.add_patch(patch)
