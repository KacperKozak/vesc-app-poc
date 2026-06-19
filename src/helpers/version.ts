export function androidVersionCode(version: string): number {
  const parts = version.split('.')
  const numbers = parts.map(Number)

  if (
    parts.length !== 3 ||
    !numbers.every((part) => Number.isInteger(part) && part >= 0) ||
    numbers[1] > 99 ||
    numbers[2] > 99
  ) {
    throw new Error(`Invalid version "${version}"`)
  }

  const [major, minor, patch] = numbers
  return major * 10000 + minor * 100 + patch
}
