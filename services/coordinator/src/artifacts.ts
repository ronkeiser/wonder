/**
 * Artifacts Repository
 *
 * Manages staged artifacts in DO SQLite during workflow execution.
 * Artifacts are committed to RESOURCES on workflow completion.
 */

/**
 * Initialize artifacts table in SQLite storage
 */
export function initializeArtifactsTable(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

/**
 * Stage an artifact for later commitment
 *
 * @param sql - SQLite storage
 * @param artifact - Artifact to stage
 */
export function stageArtifact(
  sql: SqlStorage,
  artifact: { id: string; type_id: string; content: Record<string, unknown> },
): void {
  const now = new Date().toISOString();
  sql.exec(
    `INSERT INTO artifacts (id, type_id, content, created_at) VALUES (?, ?, ?, ?)`,
    artifact.id,
    artifact.type_id,
    JSON.stringify(artifact.content),
    now,
  );
}

/**
 * Get all staged artifacts
 *
 * @param sql - SQLite storage
 * @returns Array of staged artifacts
 */
export function getStagedArtifacts(sql: SqlStorage): Array<{
  id: string;
  type_id: string;
  content: Record<string, unknown>;
  created_at: string;
}> {
  const rows = sql
    .exec<{ id: string; type_id: string; content: string; created_at: string }>(
      `SELECT id, type_id, content, created_at FROM artifacts`,
    )
    .toArray();

  return rows.map((row) => ({
    id: row.id,
    type_id: row.type_id,
    content: JSON.parse(row.content),
    created_at: row.created_at,
  }));
}

/**
 * Commit staged artifacts to RESOURCES service
 *
 * @param env - Environment bindings
 * @param sql - SQLite storage
 */
export async function commitArtifacts(env: Env, sql: SqlStorage): Promise<void> {
  const staged = getStagedArtifacts(sql);

  if (staged.length === 0) {
    return;
  }

  // TODO: Implement artifact commitment to RESOURCES
  // using artifacts = env.RESOURCES.artifacts();
  // for (const artifact of staged) {
  //   await artifacts.create(artifact);
  // }
}
