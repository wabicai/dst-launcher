import { spawn, type ChildProcess } from 'node:child_process';

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });
  });
}

export function streamCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
  callbacks: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
    onClose?: (code: number | null) => void;
  } = {},
): ChildProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const emitLines = (
    stream: NodeJS.ReadableStream,
    callback?: (line: string) => void,
  ) => {
    if (!callback) return;
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        callback(line);
      }
    });
    stream.on('end', () => {
      if (buffer) callback(buffer);
    });
  };

  emitLines(child.stdout, callbacks.onStdout);
  emitLines(child.stderr, callbacks.onStderr);
  child.on('close', callbacks.onClose ?? (() => undefined));
  return child;
}

export async function runStreamingCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
  callbacks: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const bind = (stream: NodeJS.ReadableStream, collector: 'stdout' | 'stderr', callback?: (line: string) => void) => {
      let buffer = '';
      stream.on('data', (chunk) => {
        const text = chunk.toString();
        if (collector === 'stdout') {
          stdout += text;
        } else {
          stderr += text;
        }

        if (!callback) {
          return;
        }

        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            callback(line);
          }
        }
      });

      stream.on('end', () => {
        if (callback && buffer.trim()) {
          callback(buffer);
        }
      });
    };

    bind(child.stdout, 'stdout', callbacks.onStdout);
    bind(child.stderr, 'stderr', callbacks.onStderr);

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });
  });
}
