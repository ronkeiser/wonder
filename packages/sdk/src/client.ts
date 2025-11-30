import type { components, paths } from './generated/schema';

type APIResponse<T> = { data: T; error: undefined } | { data: undefined; error: Error };

export class APIClient {
  constructor(private baseUrl: string) {}

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; params?: Record<string, string> },
  ): Promise<APIResponse<T>> {
    try {
      let url = `${this.baseUrl}${path}`;

      // Replace path parameters
      if (options?.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          url = url.replace(`{${key}}`, encodeURIComponent(value));
        });
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const error = await response.text();
        return { data: undefined, error: new Error(error || response.statusText) };
      }

      const data = (await response.json()) as T;
      return { data, error: undefined };
    } catch (error) {
      return { data: undefined, error: error as Error };
    }
  }

  async post<T = unknown>(path: string, options?: { body?: unknown }): Promise<APIResponse<T>> {
    return this.request<T>('POST', path, options);
  }

  async get<T = unknown>(
    path: string,
    options?: { params?: Record<string, string> },
  ): Promise<APIResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  async delete<T = unknown>(
    path: string,
    options?: { params?: Record<string, string> },
  ): Promise<APIResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }
}
