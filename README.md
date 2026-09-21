# MRI Lab

A browser-based lab for building MRI visualizations and simulations one step at
a time.

## Run locally

```bash
nvm use
npm install
npm run dev
```

To expose Vite from a container, run:

```bash
npm run dev -- --host 0.0.0.0
```

Run the deterministic simulation tests with:

```bash
npm test
```

## MRI Intuition presentation

The companion lecture presentation is available at `/presentation/` while the
development server is running. It is built and deployed alongside the MRI Lab,
so the same path also works on GitHub Pages. Use the on-screen ◀ and ▶ controls
or the keyboard's left and right arrow keys to move through its slide states.
Forward steps play their teaching animations; backward steps restore the prior
state immediately.

Presentation content is organized as self-contained slide modules under
`src/presentation/slides`. Each module declares its heading, number of reveal
states, and rendered component, while `slides/index.ts` is the ordered slide
registry. Interactive state belongs inside its slide module, so new slides can
be added without extending a single global step component. Deck-wide values
that must survive slide transitions, such as B0, remain in the presentation
shell and are passed through the common slide interface.

The “How are we measuring?” module continues the centered field into an
interactive analogy: a multicolor WebGL spinning top precesses after a
clickable cartoon hand flicks it, then exponentially realigns with B0.

The tissue-comparison module then isolates CSF, splits it into a 6×6 grid,
introduces B0 imperfections, and recombines the 36 magnetizations into a
stacked sphere. One WebGL renderer handles the whole grid. The CSF T1/T2
values come from the simulator; both the magnets and the graphs use its Bloch
state calculation. Signals are normalized to the same total M0 before and
after subdivision: `abs(sum(Mx + i*My)) / 36`, not a sum of magnitudes.
Static frequency offsets cause the extra T2* loss while T1 remains unchanged;
the dim reference curve shows intrinsic T2. See §5.3 of
[Hanson's MRI introduction](https://backend.orbit.dtu.dk/ws/portalfiles/portal/106310664/MRI_English_a4.pdf)
for the underlying dephasing mechanism.

This is an illustrative field profile, not a scanner calibration: offsets
span less than 1 Hz so dephasing develops subtly alongside real-time CSF relaxation.
The field-line bending and color contrast are exaggerated; local direction
tilts are not simulated. The finite 36-vector sum can have small residual
ripples rather than a perfectly exponential T2* envelope. The CSF-only steps
view the spheres from above. Splitting starts all cells at the enlarged
sphere's center; recombining replays a fresh excitation after the layout
settles, using the same 36 field offsets in stacked view. Both graphs retain
shared scroll zoom, initially covering 12 seconds.
From the first enlarged CSF sphere, Space or the toolbar's play/pause control freezes
both Bloch evolution and graph sampling on one simulation clock. Resuming
excludes the paused wall time; zoom still works while paused. Layout transitions
can finish while paused, but pending RF excitation waits for simulation time.
Navigation and replay resume playback. Stacked magnets retain the same full
width/depth proportions as the original enlarged magnet.
Left/Right and Space remain presentation shortcuts even after using a slider
or button; held-key repeats are ignored. Space does nothing before playback
controls become available. Tab and Enter retain normal control navigation.

Once the imperfect-field CSF grid appears, click either graph after t=0 to
place or move a yellow 180° refocusing pulse and replay the acquisition.
The same Bloch pulse rotates every grid/stacked magnet: phase alignment returns
at twice the selected delay, while irreversible T2 decay remains. The T1 graph
includes negative magnetization after inversion. The dim intrinsic T2 curve
remains as a reference. Late pulses extend the timeline to include their echo;
zoom and pause still work. The pulse carries into stacked view; Refresh clears it.

The next chapter (`HowWeMeasure3Slide`) explains refocusing with six proton
racers. They split from the large sphere into grid-sized cells along a shared
checkerboard start/finish strip. Opaque lane colors run from cool to warm as
field strength increases left to right, replacing the field arrows in this view. Each racer's
speed uses exactly its slowed displayed precession frequency. Its unwrapped
distance is proportional to `v*t` before a selected 180° pulse at `tau`, and
`v*(2*tau-t)` afterward. Racers are not clamped, wrapped, or removed off-screen,
so even a late pulse brings all six back to the line at `2*tau`, then past it.
Only the running direction is reversed as a teaching metaphor: the magnets
and both plots still use actual Bloch rotations and CSF T1/T2 relaxation.
The chapter starts a fresh acquisition and preserves graph zoom, pulse editing,
Space/play/pause, and Refresh. Layout completes before the initial RF pulse.

### Contrast exploration

The next slide, **How do we get contrasts?**, keeps the outgoing race mounted
until its exit animation completes: the south pole moves up, north pole down,
and the spheres/track fade away. It then disposes that WebGL scene. Pause/resume is
absent; all four tissue curves and the MRI image are evaluated immediately,
without a running acquisition clock.

Click the lower graph to select **TR** (red tag), or the upper graph to select
**TE** (yellow line). A yellow RF-wave tag follows at **TE/2**, and 512
field-offset ensembles per tissue produce the refocused signal. This slide
alone uses offsets from −20 to +20 Hz, with normalized Gaussian population
weights (standard deviation 5 Hz). The dense sampling pushes discrete-grid
recurrences past the maximum 12 s plot window; the smooth weights suppress
sharp-boundary ripples without changing intrinsic T1/T2 or the signal at TE.
The shared weighted phasor sum is cached across tissues, then combined with
each tissue's relaxation: an exact factorization of this ideal 90°/180° Bloch
sequence, verified against explicit ensemble-by-ensemble simulation.
The earlier race/dephasing slides keep their slower frequency differences.
The initial axes cover 6 seconds for T1 recovery and 400 ms for transverse
signal so clinically useful echo delays are easy to select. Scroll each axis
independently to zoom; `+`/`-` and `0` also work on a focused graph. Clicking at
zero or pressing Delete clears that graph's timing; Refresh clears both.

The image uses the supplied 256×256 `matrix[y][x]` maps, without transposition,
and the [standard teaching spin-echo approximation](https://www.cis.rit.edu/htbooks/mri/chap-10/chap-10.htm):
`S = rho * (1 - exp(-TR/T1)) * exp(-TE/T2)`. Unset TR disables recovery weighting
(full equilibrium); unset TE disables decay weighting (zero echo delay).
Actual zero/negative repetition times are not simulated. TE must be shorter
than a finite TR; invalid combinations display an explanatory label and a
black image. Intensities share one fixed linear [0,1] grayscale window, not
individually normalized image gains.

Short TR with short TE is labelled T1-weighted, long TR with long TE is
T2-weighted, and long/unset TR with short/unset TE is spin-density weighted.
Short TR with long TE is labelled mixed T1/T2. The descriptive categories use
2000 ms TR / 50 ms TE teaching thresholds, not universal clinical boundaries.
The pixel signal varies continuously across these label thresholds.

The lower curves show independent saturation-recovery preparation; that
recovered fraction initializes the upper 90°/180° acquisition. This factorized
model does not simulate a full repeated steady-state pulse train or corrections
to longitudinal recovery caused by refocusing pulses in prior repetitions.
At TE, the weighted complex mean of each tissue's simulated vectors matches the
same signal equation; away from TE it retains genuine gradient dephasing.
Plot tissues retain the simulator's 1.5 T table and colors, whereas image
voxels use the supplied synthetic map values, which differ from that table.
These are illustrative tissue-model estimates, not measured quantitative maps.

## GitHub Pages

Pushes to `main` run the GitHub Pages workflow in
`.github/workflows/pages.yml`. It installs the locked dependencies, runs the
test suite, builds the Vite app with the repository's Pages base path, and
deploys the generated `dist` artifact.

Before the first deployment, open the repository's **Settings → Pages** and
set **Build and deployment → Source** to **GitHub Actions**. The workflow also
supports a manual run from the repository's Actions tab.

Calibrate the editable gradients against the same k-space integrator used by
the simulation with:

```bash
npm run calibrate:gradients
```

The report compares the current pulse amplitudes with a Cartesian matrix sized
for the rendered grid. Optional flags include `--grid-size=64`,
`--voxel-mm=2`, `--adc-dwell-ms=0.1`, `--imperfections`, and `--json`.
Use `--encoding-start-ms=6.8` when calibrating a custom RF end time.

The automated suite also covers workers, playback hooks, graph editing,
renderer-independent 3D surface math, and app-level UX. Run coverage with
`npm run test:coverage`; see [TESTING.md](TESTING.md) for the full test matrix
and the deliberate WebGL/browser boundary.

Open the URL printed by Vite. Drag to orbit the scene, scroll to zoom,
right-drag to pan, and click a sphere to select its hydrogen ensemble. Press
`R` or use the floating viewport control to reset the camera. In Slice View,
vertical dragging changes elevation and horizontal dragging circles the slice
normal, while Block View and Stacked View remain unrestricted.

## Project structure

- `src/components/LabScene.tsx` owns the Three.js scene, GPU-instanced 128 × 128
  ensemble slice, cutaway block, smooth camera targeting, selection
  calculation, and render loop.
- `src/models/HydrogenEnsemble.ts` defines each ensemble's intrinsic
  properties and computes field-dependent magnetic properties on demand.
- `src/simulation/fid.ts` applies exact free evolution and coherent 90°/180°
  RF rotations to each ensemble's magnetization state.
- `src/workers/fidSimulation.worker.ts` advances simulated time and samples the
  aggregate signal away from the rendering thread.
- `src/simulation/gradientEncoding.ts` integrates simultaneous windowed-sinc
  RF and slice-selection fields with the Bloch equation, then applies
  phase-encoding and readout gradients to each ensemble's transverse phase;
  its sequence is paced for inspection by
  `src/hooks/useGradientEncodingPlayback.ts`.
- Slice View can overlay a translucent, spatially smoothed 3D surface for
  laboratory/rotating-frame frequency, phase, or transverse amplitude. During
  Gradient Encoding the frequency surfaces use an approximately 81.1 kHz
  full-gradient edge scale (30 mT/m over 63.5 mm), so G_PE tilts only the phase
  axis, G_RO tilts only the readout axis, and changing pulse amplitude changes
  slope proportionally. Other
  experiments retain local frequency auto-ranging to expose ppm-scale B0
  structure.
- `src/components/FidExperimentPanel.tsx`,
  `src/components/SpinEchoExperimentPanel.tsx`, and
  `src/components/GradientEncodingExperimentPanel.tsx` contain the experiment
  panels.
- `src/App.tsx` contains the React interface around the canvas.
- `src/styles.css` contains the responsive visual system.

The grid is rendered as a single `THREE.InstancedMesh` of translucent sphere
geometry, so all 16,384 ensembles remain practical to navigate while retaining
true 3D volumes for future internal geometry. The scene lifecycle is isolated
in `LabScene`, while the worker owns simulation timing and signal sampling.
The slice-preset menu also includes a 3 CSF Circle Phantom that places equal
CSF disks at the quarter, center, and three-quarter points of the slice's
top-left-to-bottom-right diagonal.

The Shepp–Logan MRI Phantom preset follows the 2D MRI ellipse geometry from
[Gach, Tanase, and Boada](https://doi.org/10.1109/ICSEng.2008.15). Bone, CSF,
gray-matter, and white-matter regions use the lab's corresponding simulated
sample types. The lab does not yet model scalp or tumor tissue, so the scalp
shell is omitted and the small high-spin-density inclusions use CSF as the
closest available proton-density proxy.

Block View expands the logical domain to 128 × 128 × 128 voxels. A removed
64³ corner exposes one 64 × 64 quadrant of the source slice at the block's
mid-plane. Two rotated copies of that quadrant form the other cut faces. Block
View renders and simulates only these three exposed faces—12,288 colored
spheres—while Slice View retains the complete 128 × 128 source plane. Only
exposed, non-simulated shell voxels are rendered as a lightweight, faint-gray
point cloud; the block interior is omitted. They provide volumetric context
without participating in selection or signal calculations.

The initial non-uniform isocenter approximation uses normalized radial
position `rho` and a 1 ppm outer variation:

- Field variation: `delta B = B0 * 10^-6 * rho^2`
- Local field: `B0' = B0 + delta B`
- Off-parallel angle: `delta theta = 10^-4 degrees * rho^2`
- Arrows remain visually parallel because this angle is below display
  resolution.

The top-bar realism menu leaves all effects disabled by default.
`B0 inhomogeneity` enables the isocenter profile above. `Intravoxel
dephasing` represents each 1 mm³ ensemble with a deterministic 3 × 3 set of
spin packets. Their positions sample applied-gradient and B0 variation within
the voxel, while a tissue-dependent static frequency spread supplies the
reversible part of T2* decay. RF 180° pulses therefore refocus those static
offsets rather than treating the shortened FID as irreversible T2 decay.
`B1 inhomogeneity` applies a smooth transmit-field profile whose peak flip-angle
deviation grows from 4% at 1.5 T to 15% at 7 T. Ping and spin-echo RF pulses
remain instantaneous, but excitation and refocusing angles are no longer
spatially perfect; gradient slice selection instead integrates the finite RF
waveform throughout its duration.
`Gradient imperfections` passes commanded gradients through a causal response
with a 0.04 ms fast coil time constant and a 4% component decaying over 0.8 ms.
The gradient editor shows the resulting applied waveform as a dashed yellow
trace, and that response—not the ideal command—drives phase accumulation.
`Receiver noise` adds deterministic Gaussian noise after ensemble summation to
the independent I and Q voltage channels at a normalized SNR of 80. It affects
FID/echo measurements and fitted echo peaks, but not the underlying arrows or
longitudinal magnetization.
`Tissue heterogeneity` replaces each tissue preset's single relaxation values
with smooth, deterministic local values: T1 varies by up to 5%, while T2 and
the refocusable T2* ratio vary by up to 8%. The selected-cell readout and every
simulation path use the same local values, and T2* is constrained not to exceed
T2.

The Gradient Encoding timing diagram shares one 20 ms clock across editable RF,
G_SS, G_PE, and G_RO rows. The RF row draws a Hamming-windowed sinc envelope;
its physical peak B1, duration, transmit bandwidth, time-bandwidth product, and
nominal flip angle are displayed together. Changing pulse width therefore
changes both the sinc truncation and RF area—it no longer just changes how fast
a fixed 90° rotation completes. Reset calibrates the current transmit band to a
nominal 90° pulse when the 25 µT peak-B1 limit permits it. This educational
ceiling is consistent with [published scanner-scale B1 examples](https://pmc.ncbi.nlm.nih.gov/articles/PMC4589956/).
The panel reports both the current peak B1 and the peak required for 90°; if a
very broad transmit band exceeds the limit, reducing |G_SS| provides a thicker
slice without demanding the same RF bandwidth.
Each timing row can also be bypassed independently with its checked-by-default
On control. Bypassing a channel removes it from the applied sequence without
discarding its editable waveform.

A frequency-to-position mapping below G_SS plots angular frequency against the
slice's 0–127 mm position. Its green line uses the effective first G_SS lobe,
while two independently draggable yellow boundaries define the transmit
bandwidth. Their intersections project onto a yellow spatial band, with `delta
z = delta omega / (gamma |G_SS|)`. At the 30 mT/m full scale, the default 17.4
mT/m selection gradient and 4.655 krad/s (0.741 kHz) band excite the 1 mm
isocenter plane represented by Slice View. Negative G_SS reverses the spatial
mapping; zero G_SS selects the whole volume only when the transmit band contains
zero angular-frequency offset.

The Bloch integrator applies B1, G_SS, T1, and T2 simultaneously during RF, so
Block View shows progressive tilt and through-slice phase dispersion before the
pulse has ended. The following opposite G_SS lobe defaults to exactly half the
selection-lobe area, approximating the conventional slice-refocusing moment;
editing the selection timing or amplitude keeps that ratio matched unless the
rewinder amplitude is deliberately overridden. RF ends as phase encoding
begins, while readout prephasing leads into a positive lobe with the same
duration as the RF pulse.

Below G_PE and G_RO, paired grayscale maps display the current complex spatial
encoding basis. The playhead's integrated applied gradient moments determine
`kx` and `ky`; each voxel is rendered as `cos(2 pi k dot r)` in the real map and
`sin(2 pi k dot r)` in the imaginary map. Zero is mid-gray, while -1 and +1 are
black and white. With gradient imperfections enabled, the maps follow the
modeled coil response and eddy-current tail rather than the commanded square
pulses.

The brain T2* values use [published 1.5/3/7 T measurements](https://pubmed.ncbi.nlm.nih.gov/17459640/).
CSF uses the 333.5 ms and 168 ms values from a [compiled 3/7 T quantitative-MRI
table](https://cris.maastrichtuniversity.nl/ws/files/32795321/c6050.pdf); its
1.5 T value is a best-effort 550 ms extrapolation. Cortical bone is limited by
the lab's existing 0.4 ms intrinsic T2, consistent with its [sub-millisecond
UTE regime](https://pmc.ncbi.nlm.nih.gov/articles/PMC3197976/). These are
educational preset values, not patient-specific tissue parameters.

Derived ensemble properties use the shared profile implementation in
`HydrogenEnsemble.ts`; rendered arrows intentionally remain parallel because
the modeled angular deviation is not visually resolvable. Magnetization-arrow
hue encodes normalized field-strength variation, while brightness encodes the
normalized off-parallel angle. Their precession is rendered with a slowed
laboratory-frame carrier by default. The nominal `B0` rotating frame can be
selected so only each ensemble's frequency offset contributes to its displayed
phase.
