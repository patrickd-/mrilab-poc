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
- `src/simulation/gradientEncoding.ts` applies orthogonal phase-encoding and
  readout gradient areas to each ensemble's transverse phase; its sequence is
  paced for inspection by `src/hooks/useGradientEncodingPlayback.ts`.
- Slice View can overlay a translucent, spatially smoothed 3D surface for
  laboratory/rotating-frame frequency, phase, or transverse amplitude.
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

Block View expands the logical domain to 128 × 128 × 128 voxels. A removed
64³ corner exposes one quadrant of the full source slice at the block's
mid-plane. Two rotated copies of that 64 × 64 quadrant form the other cut
faces, so all three exposed faces are simulated without double-counting their
horizontal face. In total, 24,576 colored spheres participate in simulations
and can be selected. Only exposed, non-simulated shell voxels are rendered as
a lightweight, faint-gray point cloud; the block interior is omitted. They
provide volumetric context without participating in selection or signal
calculations.

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
deviation grows from 4% at 1.5 T to 15% at 7 T. RF pulses remain instantaneous,
but excitation and refocusing angles are no longer spatially perfect.
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
