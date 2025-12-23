/**
 * Generated migrations for Coordinator DO SQLite
 *
 * This file is imported by DefinitionManager to run migrations via drizzle migrator.
 *
 * Note: The SQL file has been manually edited to remove FK constraints to external
 * tables (projects, workflows) that don't exist in the DO's isolated SQLite.
 */

import m0000 from './0000_organic_vengeance.sql';
import m0001 from './0001_condemned_shinko_yamashiro.sql';
import journal from './meta/_journal.json';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
  },
};
