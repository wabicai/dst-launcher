import type { ChildProcess } from 'node:child_process';

interface ShardProcesses {
  master?: ChildProcess;
  caves?: ChildProcess;
}

class NativeProcessManager {
  private processes = new Map<string, ShardProcesses>();

  register(slug: string, shard: 'master' | 'caves', proc: ChildProcess) {
    const entry = this.processes.get(slug) ?? {};
    entry[shard] = proc;
    this.processes.set(slug, entry);

    proc.on('close', () => {
      const current = this.processes.get(slug);
      if (current?.[shard] === proc) {
        current[shard] = undefined;
      }
    });
  }

  get(slug: string): ShardProcesses | undefined {
    return this.processes.get(slug);
  }

  isRunning(slug: string, shard: 'master' | 'caves'): boolean {
    const proc = this.processes.get(slug)?.[shard];
    return proc !== undefined && proc.exitCode === null && !proc.killed;
  }

  async killAll(slug: string): Promise<void> {
    const entry = this.processes.get(slug);
    if (!entry) return;

    const promises: Promise<void>[] = [];
    for (const shard of ['master', 'caves'] as const) {
      const proc = entry[shard];
      if (proc && proc.exitCode === null && !proc.killed) {
        promises.push(
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve();
            };
            proc.on('close', finish);
            proc.kill('SIGTERM');
            const timer = setTimeout(() => {
              if (proc.exitCode === null && !proc.killed) {
                proc.kill('SIGKILL');
              }
              finish();
            }, 5000);
            if (proc.exitCode !== null) finish();
          }),
        );
      }
    }

    await Promise.all(promises);
    this.processes.delete(slug);
  }

  async killAllProjects(): Promise<void> {
    const slugs = [...this.processes.keys()];
    await Promise.all(slugs.map((slug) => this.killAll(slug)));
  }
}

export const nativeProcessManager = new NativeProcessManager();

// Cleanup on process exit
process.on('exit', () => {
  for (const [, entry] of nativeProcessManager['processes']) {
    for (const shard of ['master', 'caves'] as const) {
      const proc = entry[shard];
      if (proc && proc.exitCode === null && !proc.killed) {
        proc.kill('SIGKILL');
      }
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void nativeProcessManager.killAllProjects().then(() => process.exit(0));
  });
}
