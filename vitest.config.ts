import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        // The Three.js/WebGL lifecycle needs a real-browser visual smoke test.
        // Its deterministic layout and surface calculations live in the
        // separately covered sceneMath module.
        'src/components/LabScene.tsx',
        'src/main.tsx',
        'src/presentation/main.tsx',
        // Static WebGL rendering reuses the LabScene material and lighting;
        // presentation behavior is covered at the surrounding component.
        'src/presentation/ProtonSphereGraphic.tsx',
        'src/presentation/ProtonBurst.tsx',
        'src/presentation/slides/howWeMeasure/SpinningTopGraphic.tsx',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
})
