export function getSolidityIndex(index: number): number {
  if (index < 0) return -(index + 1);
  return index;
}
