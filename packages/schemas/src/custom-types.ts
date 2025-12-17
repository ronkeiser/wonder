import type { CustomTypeDefinition } from './types';

export class CustomTypeRegistry {
  private types = new Map<string, CustomTypeDefinition>();

  register(name: string, definition: CustomTypeDefinition): void {
    if (this.types.has(name)) {
      throw new Error(`Custom type '${name}' is already registered`);
    }
    this.types.set(name, definition);
  }

  get(name: string): CustomTypeDefinition | undefined {
    return this.types.get(name);
  }

  has(name: string): boolean {
    return this.types.has(name);
  }

  getAll(): Map<string, CustomTypeDefinition> {
    return new Map(this.types); // Return copy for immutability
  }
}
