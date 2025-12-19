/** Type definitions for artifact types */

export type ArtifactType = {
  id: string;
  version: number;
  name: string;
  description: string;
  schema: object;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ArtifactTypeInput = {
  version?: number;
  name: string;
  description?: string;
  schema: object;
  autoversion?: boolean;
};
