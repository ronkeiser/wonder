/**
 * CLI configuration loading
 *
 * Loads configuration from .env files, searching from the current directory
 * up to the filesystem root.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WflowConfig {
  apiKey?: string;
  apiUrl?: string;
}

/**
 * Parse a .env file into a key-value object
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Find and load .env file, searching from startDir up to root
 */
function findEnvFile(startDir: string): Record<string, string> | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const envPath = path.join(currentDir, '.env');

    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        return parseEnvFile(content);
      } catch {
        // Ignore read errors, continue searching
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Load wflow configuration from environment and .env files
 *
 * Priority (highest to lowest):
 * 1. Process environment variables
 * 2. .env file (searched from cwd upward)
 */
export function loadConfig(cwd: string = process.cwd()): WflowConfig {
  const config: WflowConfig = {};

  // Load from .env file first (lower priority)
  const envFile = findEnvFile(cwd);
  if (envFile) {
    if (envFile.WONDER_API_KEY) {
      config.apiKey = envFile.WONDER_API_KEY;
    }
    if (envFile.RESOURCES_URL) {
      config.apiUrl = envFile.RESOURCES_URL;
    }
  }

  // Override with process environment (higher priority)
  if (process.env.WONDER_API_KEY) {
    config.apiKey = process.env.WONDER_API_KEY;
  }
  if (process.env.RESOURCES_URL) {
    config.apiUrl = process.env.RESOURCES_URL;
  }

  return config;
}
