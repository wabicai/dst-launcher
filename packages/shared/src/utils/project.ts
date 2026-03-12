export const DEFAULT_PROJECT_NAME = '新的 DST 项目';
export const DEFAULT_PROJECT_SLUG = 'new-dst-project';

export function createProjectSlug(input: string, fallback = DEFAULT_PROJECT_SLUG): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || fallback;
}

export function createRemoteDeployPath(slug: string): string {
  const normalizedSlug = createProjectSlug(slug, DEFAULT_PROJECT_SLUG);
  return `~/dst-launcher/${normalizedSlug}`;
}
