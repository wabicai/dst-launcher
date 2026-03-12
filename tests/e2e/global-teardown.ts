import fs from 'node:fs/promises';
import path from 'node:path';

const e2eDir = path.join('/Volumes/ai-work/dst-launcher', '.tmp', 'e2e');

async function globalTeardown() {
  await fs.rm(e2eDir, { recursive: true, force: true });
}

export default globalTeardown;
