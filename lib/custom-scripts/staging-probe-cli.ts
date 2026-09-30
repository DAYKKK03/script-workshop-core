/** Converts a completed staging decision gate into a shell-safe exit status. */
export function stagingProbeExitCode(result: { gate: boolean }) {
  return result.gate ? 0 : 1;
}
