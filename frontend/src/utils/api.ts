// api — typed fetch wrapper.
// All error responses from the backend use { error: 'message' }. Always reads body.error.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues?: unknown[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const res = await fetch(path, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let issues: unknown[] | undefined;
    try {
      const data = await res.json();
      if (typeof data.error === 'string') message = data.error;
      if (Array.isArray(data.issues)) issues = data.issues;
    } catch {
      // ignore parse errors — keep default message
    }
    throw new ApiError(res.status, message, issues);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string, options?: Omit<ApiOptions, 'body'>) =>
    request<T>(path, { method: 'GET', ...options }),
  post:   <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, { method: 'POST', body, ...options }),
  put:    <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, { method: 'PUT', body, ...options }),
  patch:  <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, { method: 'PATCH', body, ...options }),
  delete: <T>(path: string, options?: ApiOptions) =>
    request<T>(path, { method: 'DELETE', ...options }),
};
