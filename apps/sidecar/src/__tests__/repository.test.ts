import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client';
import { ProjectRepository } from '../db/repository';
import { createDefaultClusterConfig } from '@dst-launcher/shared';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ProjectRepository', () => {
  it('可以创建并读取项目明细', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-launcher-'));
    tempDirs.push(tempDir);
    const db = createDatabase(path.join(tempDir, 'db.sqlite'));
    const repository = new ProjectRepository(db);

    const projectId = await repository.createProject({
      name: '测试服',
      slug: 'test-server',
      description: 'desc',
      target: { type: 'local', dockerContext: 'desktop-linux' },
      clusterConfig: createDefaultClusterConfig('测试服'),
    });

    const detail = await repository.getProjectDetail(projectId);
    expect(detail.name).toBe('测试服');
    expect(detail.target.type).toBe('local');
    expect(detail.clusterConfig.master.serverPort).toBe(10999);
    expect(detail.modsSummary.prefetch.state).toBe('not_added');
  });
});
