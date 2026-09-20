export interface CsfPose { x: number; y: number; radius: number; shell: number; thickness: number }

/** All daughters start as coincident full-sized copies, not zero-sized cells.
 * Only one shell is needed at their shared origin; the magnets overlap into
 * one silhouette and separate as their centers move toward the grid. */
export function splitCsfOrigins(single: CsfPose, count: number): CsfPose[] {
  return Array.from({ length: count }, (_, index) => ({ ...single, shell: index === 0 ? single.shell : 0 }))
}

/** Rotate the view, not the Bloch state: at pi/2, B0 points at the camera and
 * the transverse x/y plane lies in the screen. */
export function csfViewVector(m: { x: number; y: number; z: number }, angle: number) {
  return { x: m.x, y: m.z * Math.cos(angle) + m.y * Math.sin(angle),
    z: m.z * Math.sin(angle) - m.y * Math.cos(angle) }
}
