# Synthetic MRI tissue maps

These three user-supplied files describe the same 256×256 slice:

- `spin_density_relative.json`: relative proton/spin density (0–1).
- `t1_relaxation_ms.json`: longitudinal relaxation time constants, in milliseconds.
- `t2_decay_ms.json`: transverse relaxation time constants, in milliseconds—not signal remaining at a particular TE.

Index each matrix as `[y][x]`. Zero-density background stays black. The contrast
slide reads these files without changing or transposing their values.

These are **synthetic tissue-model estimates**, not quantitative maps measured
from a scan. The image uses their values directly; the accompanying four-tissue
plots use the existing simulator's tissue table instead.
