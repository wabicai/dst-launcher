export type TargetRow = {
  id: string;
  type: string;
  configJson: string;
  createdAt: number;
  updatedAt: number;
};

export type ClusterConfigRow = {
  id: string;
  projectId: string;
  configJson: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  targetId: string;
  createdAt: number;
  updatedAt: number;
};

export type DeploymentRow = {
  id: string;
  projectId: string;
  composePath: string;
  targetPath: string;
  lastDeployedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type BackupRecordRow = {
  id: string;
  projectId: string;
  filename: string;
  location: string;
  sizeBytes: number;
  createdAt: number;
};

export type TaskRunRow = {
  id: string;
  projectId: string;
  action: string;
  status: string;
  message: string;
  createdAt: number;
  updatedAt: number;
};

export type ModCacheRow = {
  workshopId: string;
  type: string;
  title: string;
  author: string;
  description: string;
  previewUrl: string;
  sourceUrl: string;
  tagsJson: string;
  steamUpdatedAt: number | null;
  subscriptions: number;
  favorited: number;
  views: number;
  collectionMembersJson: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectModEntryRow = {
  id: string;
  projectId: string;
  workshopId: string;
  type: string;
  source: string;
  enabled: number;
  sortOrder: number;
  prefetchState: string;
  prefetchMessage: string;
  prefetchedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
