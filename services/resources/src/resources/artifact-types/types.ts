/** Type definitions for artifact types */

export type ArtifactType = {
  id: string;
  version: number;
  name: string;
  description: string;
  schema: object;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactTypeInput = {
  version?: number;
  name: string;
  description?: string;
  schema: object;
  autoversion?: boolean;
};
