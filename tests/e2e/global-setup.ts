import fs from 'node:fs/promises';
import path from 'node:path';

const e2eDir = path.join('/Volumes/ai-work/dst-launcher', '.tmp', 'e2e');

async function globalSetup() {
  await fs.rm(e2eDir, { recursive: true, force: true });
  await fs.mkdir(e2eDir, { recursive: true });
}

export default globalSetup;
