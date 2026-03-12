import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: ['@dst-launcher/shared', 'fastify', '@fastify/cors', '@fastify/websocket', 'nanoid', 'zod'],
  outExtension() {
    return {
      js: '.cjs',
    };
  },
});
