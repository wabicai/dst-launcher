export function formatBoolean(value: boolean): string {
  return value ? 'true' : 'false';
}

export function formatIniValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') {
    return formatBoolean(value);
  }
  return String(value).replace(/[\r\n]/g, ' ');
}

export function toTimestampString(input: number | Date): string {
  return new Date(input).toISOString();
}
