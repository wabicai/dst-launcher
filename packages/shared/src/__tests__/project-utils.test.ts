import { describe, expect, it } from 'vitest';
import { createProjectSlug, createRemoteDeployPath, DEFAULT_PROJECT_SLUG } from '@dst-launcher/shared';

describe('项目工具', () => {
  it('可以把项目名转换成合法 slug', () => {
    expect(createProjectSlug('Smoke UI Project')).toBe('smoke-ui-project');
    expect(createProjectSlug('DST  Project___V1')).toBe('dst-project-v1');
  });

  it('会在无法生成 slug 时回退到默认值', () => {
    expect(createProjectSlug('中文项目')).toBe(DEFAULT_PROJECT_SLUG);
    expect(createRemoteDeployPath('')).toBe(`~/dst-launcher/${DEFAULT_PROJECT_SLUG}`);
  });
});
