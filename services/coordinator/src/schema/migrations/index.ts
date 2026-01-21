/**
 * Generated migrations for Coordinator DO SQLite
 *
 * This file is imported by DefinitionManager to run migrations via drizzle migrator.
 *
 * Note: The SQL file has been manually edited to remove FK constraints to external
 * tables (projects, workflows) that don't exist in the DO's isolated SQLite.
 */

import m0000 from './0000_fuzzy_northstar.sql';
import m0001 from './0001_right_namora.sql';
import m0002 from './0002_flashy_white_tiger.sql';
import m0003 from './0003_acoustic_micromacro.sql';
import journal from './meta/_journal.json';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
  },
};
