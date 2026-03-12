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
