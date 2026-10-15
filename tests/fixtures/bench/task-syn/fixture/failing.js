/** Trivially wrong module: double() is off by one; half() is correct. */
export function double(n) {
  return n * 2 + 1;
}

export function half(n) {
  return n / 2;
}
