export function isNodeVersionSupported(version, minimum = "22.13.0") {
  const parse = (value) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value);
    return match ? match.slice(1).map((part) => Number(part)) : null;
  };

  const current = parse(version);
  const required = parse(minimum);
  if (!current || !required) return false;

  for (let index = 0; index < required.length; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}
