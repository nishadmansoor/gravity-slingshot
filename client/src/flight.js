// Playback of a server-computed path. The client never decides where the
// probe goes; it only interpolates between the points the Worker returned.

// Probe position along the server path at fractional step `s`.
// path[i] is at step i*sampleEvery, except the final point, which is at `steps`.
export function pathAt(res, s) {
  const { path, sampleEvery: k, steps } = res;
  const n = path.length;
  let a, b, u;
  if (s >= (n - 2) * k) {
    a = path[n - 2]; b = path[n - 1];
    const span = steps - (n - 2) * k;
    u = span > 0 ? Math.min(1, (s - (n - 2) * k) / span) : 1;
  } else {
    const i = Math.floor(s / k);
    a = path[i]; b = path[i + 1]; u = s / k - i;
  }
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u };
}
