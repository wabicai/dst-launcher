import type { RuntimeContainerInfo } from './base';

export function parseComposePsOutput(stdout: string): RuntimeContainerInfo[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  const entries = parseComposeEntries(trimmed);
  return entries.map((item) => ({
    service: String(item.Service ?? 'unknown'),
    state: String(item.State ?? 'unknown'),
    health: item.Health ? String(item.Health) : null,
  }));
}

function parseComposeEntries(stdout: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [parsed as Record<string, unknown>];
  } catch {
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}
