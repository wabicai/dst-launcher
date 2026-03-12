export function normalizeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function parseLineValues(input: string) {
  return input
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stringifyLineValues(values: string[]) {
  return values.join('\n');
}
