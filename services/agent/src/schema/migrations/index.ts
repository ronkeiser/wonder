/**
 * Generated migrations for Agent DO SQLite
 *
 * This file is imported by DefinitionManager to run migrations via drizzle migrator.
 */

import m0000 from './0000_initial.sql';
import m0001 from './0001_damp_bishop.sql';
import m0002 from './0002_persona_workflow_def_ids.sql';
import journal from './meta/_journal.json';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
  },
};
