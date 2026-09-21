# Synthetic MRI tissue maps

These three user-supplied files describe the same 256×256 slice:

- `spin_density_relative.json`: relative proton/spin density (0–1).
- `t1_relaxation_ms.json`: longitudinal relaxation time constants, in milliseconds.
- `t2_decay_ms.json`: transverse relaxation time constants, in milliseconds—not signal remaining at a particular TE.

Index each matrix as `[y][x]`. Zero-density background stays black. The contrast
slide preserves these source files and derives aligned display maps in memory,
without transposing or changing any anatomical locations.

These are **synthetic tissue-model estimates**, not quantitative maps measured
from a scan. Four classes are matched by their full original
`(relative density, T1 ms, T2 ms)` tuple:

| Tissue | Original tuple | Voxels |
| --- | --- | ---: |
| Cortical bone | `(0.05, 250, 5)` | 1,666 |
| CSF | `(1, 2569, 329)` | 2,864 |
| Gray matter | `(0.86, 833, 83)` | 8,863 |
| White matter | `(0.77, 500, 70)` | 8,171 |

`alignMriTissueMaps` replaces all three parameters of these classes using the
same tissue objects as the graphs: density is the CSF-normalized equilibrium
magnetization, and T1/T2 come from the simulator at the current field strength
(1.5 T in this presentation). No destination parameter values are duplicated
in the mapping table. Re-alignment always starts from the original source maps.

The remaining seven non-background classes (6,196 voxels) and zero-density
background (37,776 voxels) are unchanged. We do not infer their identities or
map by nearest density/relaxation values. Tests check every voxel's mapping and
agreement between aligned image intensity and the graph signal at TE, before
and after grayscale quantization.
