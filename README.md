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
`R` or use the floating viewport control to reset the camera. Slice View uses
an upright upper-hemisphere orbit, while Stacked View remains unrestricted.

## Project structure

- `src/components/LabScene.tsx` owns the Three.js scene, GPU-instanced 128 × 128
  ensemble slice, smooth camera targeting, selection calculation, and render
  loop.
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

The initial non-uniform isocenter approximation uses normalized radial
position `rho` and a 1 ppm outer variation:

- Field variation: `delta B = B0 * 10^-6 * rho^2`
- Local field: `B0' = B0 + delta B`
- Off-parallel angle: `delta theta = 10^-4 degrees * rho^2`
- Arrows remain visually parallel because this angle is below display
  resolution.

Derived ensemble properties use the shared profile implementation in
`HydrogenEnsemble.ts`; rendered arrows intentionally remain parallel because
the modeled angular deviation is not visually resolvable. Magnetization-arrow
hue encodes normalized field-strength variation, while brightness encodes the
normalized off-parallel angle. Their precession is rendered with a slowed
laboratory-frame carrier by default. The nominal `B0` rotating frame can be
selected so only each ensemble's frequency offset contributes to its displayed
phase.
