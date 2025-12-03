/**
 * Shared Zod validation utilities
 */

import { z } from '@hono/zod-openapi';

// ULID regex pattern: 26 characters, uppercase letters and digits (excludes I, L, O, U)
const ulidRegex = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const ulid = () => z.string().regex(ulidRegex, 'Invalid ULID format');
