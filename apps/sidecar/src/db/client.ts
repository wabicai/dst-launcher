import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'dst-launcher-sidecar.cjs'));
const { DatabaseSync } = require('node:sqlite');

export function createDatabase(dbFile: string) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const sqlite = new DatabaseSync(dbFile);
  sqlite.exec('pragma journal_mode = WAL;');
  sqlite.exec(`
    create table if not exists targets (
      id text primary key,
      type text not null,
      config_json text not null,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists cluster_configs (
      id text primary key,
      project_id text not null unique,
      config_json text not null,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists projects (
      id text primary key,
      name text not null,
      slug text not null unique,
      description text not null,
      status text not null,
      target_id text not null,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists deployments (
      id text primary key,
      project_id text not null unique,
      compose_path text not null,
      target_path text not null,
      last_deployed_at integer,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists backup_records (
      id text primary key,
      project_id text not null,
      filename text not null,
      location text not null,
      size_bytes integer not null,
      created_at integer not null
    );

    create table if not exists task_runs (
      id text primary key,
      project_id text not null,
      action text not null,
      status text not null,
      message text not null,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists mod_cache (
      workshop_id text primary key,
      type text not null,
      title text not null,
      author text not null,
      description text not null,
      preview_url text not null,
      source_url text not null,
      tags_json text not null,
      steam_updated_at integer,
      subscriptions integer not null,
      favorited integer not null,
      views integer not null,
      collection_members_json text not null,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists project_mod_entries (
      id text primary key,
      project_id text not null,
      workshop_id text not null,
      type text not null,
      source text not null,
      enabled integer not null,
      sort_order integer not null,
      prefetch_state text not null,
      prefetch_message text not null,
      prefetched_at integer,
      created_at integer not null,
      updated_at integer not null,
      unique(project_id, workshop_id)
    );

    create index if not exists idx_project_mod_entries_project_id on project_mod_entries(project_id);
    create index if not exists idx_project_mod_entries_workshop_id on project_mod_entries(workshop_id);
  `);

  return sqlite;
}

export type AppDatabase = InstanceType<typeof DatabaseSync>;
