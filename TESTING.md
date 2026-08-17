# Automated testing

The lab uses Vitest for deterministic physics, state, worker, hook, and React
interaction tests. The suite is intentionally layered: equations are tested as
plain functions first, then their worker/hook transport and the user-facing
controls are tested separately. This makes a failure point to a scientific,
timing, or interface contract instead of to a large rendered snapshot.

## Commands

```bash
npm test
npm run test:watch
npm run test:coverage
npm run build
```

`npm run test:coverage` writes an HTML report to `coverage/index.html` and
enforces minimum coverage of 85% statements, 75% branches, 85% functions, and
85% lines over the unit-testable source boundary.

## What is automated

### Ensemble model and material presets

`src/models/HydrogenEnsemble.test.ts` verifies:

- the Planck/Dirac constant relationship, proton spin, projection count,
  gyromagnetic ratio, and magnetic moment;
- every air, cortical-bone, CSF, gray-matter, and white-matter temperature,
  proton-density, T1, T2, and T2* preset at 1.5 T, 3 T, and 7 T;
- deterministic tissue heterogeneity and the constraint T2* <= T2;
- uniform and 1 ppm non-uniform B0 profiles, radial symmetry, field direction,
  edge tilt, and local field variation;
- Larmor frequency, Zeeman splitting, Boltzmann polarization, excess proton
  count, and equilibrium magnetization relationships;
- row-major slice construction and all three independently simulated Block
  View face mappings.

### FID, RF, spin echo, and receiver signal

`src/simulation/fid.test.ts` verifies:

- equilibrium without an RF pulse and exact ideal 90-y/180-x rotations;
- repeated pulses, future-pulse causality, precession, T1 recovery, T2 decay,
  and zero-relaxation edge cases;
- spin-packet normalization, intravoxel frequency spread, B0/B1/tissue realism
  propagation, and actual symmetric-packet refocusing at an echo;
- aggregate I/Q voltage, longitudinal recovery, coherent cancellation,
  equilibrium-M0 weighting, and deterministic receiver noise.

`src/components/SpinEchoExperimentPanel.test.tsx` separately verifies echo/tau
timing, measured complex-signal peak selection, inclusion of the original 90°
peak, and the exponential T2 fit and its rejection cases.

`src/components/FidExperimentPanel.test.tsx` verifies the laboratory I,
rotating-frame complex envelope, and T1 graph paths, readouts, and sliding time
window.

### Gradient sequence and slice selection

`src/simulation/gradientEncoding.test.ts` verifies:

- the RF, G_SS, G_PE, and G_RO default timing relationships;
- ideal and imperfect gradient amplitudes, causal coil rise, eddy-current tail,
  pulse boundaries, and integrated phase;
- orthogonal phase/readout axes and polarity;
- frequency-to-position mapping for positive, negative, and zero G_SS;
- transmit-band overlap, full-band selection, partial overlap, and rejection of
  out-of-band slices;
- progressive RF excitation, negative RF direction, and post-excitation T1/T2
  evolution.

`src/components/sceneMath.test.ts` verifies the renderer-independent visual
math that has historically been easy to regress:

- the three orthogonal Block View cut faces and remaining context shell;
- spatial 1-2-1 surface smoothing, including edge normalization;
- G_PE producing only a y slope and G_RO producing only an x slope on the 3D
  frequency surface, with B0 offsets added;
- laboratory/rotating frequency heights, continuous unwrapped-phase height,
  and normalized amplitude height.

`src/components/GradientEncodingExperimentPanel.test.tsx` and
`src/components/SliceSelectionMappingGraph.test.tsx` verify default/reference
waveforms, independent reset buttons, play/pause/speed routing, playheads,
keyboard and pointer editing, linked pulse boundaries, timing guides, gradient
imperfection traces, transmit-band dragging, minimum bandwidth, zero-gradient
states, and negative-gradient position mirroring.

### Timing, worker, and React state

`src/workers/fidSimulation.worker.test.ts` drives the actual worker module with
a fake worker scope. It verifies configure/start/pulse/pause/resume/reset,
initial-pulse behavior, fixed time-step changes, and the bounded work-batch
sampling loop.

`src/hooks/useFidSimulation.test.ts` verifies worker construction and cleanup,
message routing, snapshot replacement/append behavior, the five-second sliding
signal window, realism reconfiguration, and inactive reset.

`src/hooks/useGradientEncodingPlayback.test.ts` verifies animation-frame
playback, speed multipliers, pause/resume/reset/completion, inactive behavior,
and the 100 ms browser-stall cap.

### User-interface contracts

- `DarkSelect.test.tsx` guards the former filtered-option bug and verifies
  selection, Escape, and outside-click behavior.
- `RealismMenu.test.tsx` verifies all six independent options, selected state,
  count, and dismissal.
- `SimulationControls.test.tsx` verifies empty, idle, running, and paused
  states; pulse/reset routing; and time-step precision.
- `App.test.tsx` verifies experiment selection, the dismissible ensemble view
  layered over a still-active experiment, Escape/close behavior, nested slice
  presets and reset, camera/view controls, and propagation of B0 and realism
  settings into scene/simulation state.

## Deliberate unit-test boundary

`LabScene.tsx` is excluded from unit coverage because most of it is a long-lived
Three.js/WebGL resource and animation lifecycle. Mocking the entire renderer
would mostly test the mock. Its deterministic geometry and height calculations
were moved to `sceneMath.ts` and are fully unit tested instead.

The following remain good candidates for different kinds of automation:

1. A real-browser smoke test that loads the canvas, switches Slice/Block/Stacked
   views, selects a sphere, resets the camera, and checks for console/WebGL
   errors.
2. Screenshot comparisons for arrow orientation, pulse visibility, 3D surface
   slopes, camera constraints, sticky controls, dark select menus, and responsive
   layout. These need an agreed browser/GPU/font baseline to avoid noisy tests.
3. A performance benchmark for initial Slice/Block construction and frame time
   with 16,384/12,288 instances. Unit tests cannot establish interactive frame
   rate.
4. A browser Worker integration test. Unit tests cover the protocol and bounded
   batch algorithm, but not the browser's actual cross-thread scheduling.
5. Independent scientific reference fixtures if the educational model later
   needs validation against Bloch-simulator or measured data. Current tests
   establish internal equations and invariants, not clinical validity.

These gaps should not be replaced with large DOM or Three.js implementation
snapshots. Browser behavior should be tested in a browser; physical validity
should be compared with an independent reference rather than with values
generated by the same implementation.
