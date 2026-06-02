import axios from 'axios';

/**
 * Single axios instance. In dev, Vite proxies /api → backend so everything is
 * same-origin and the session cookie just works. withCredentials keeps cookies
 * flowing in production cross-origin setups too.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

/** Pull a human-readable message out of our standard error envelope. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      err.response?.data?.error?.message ||
      err.response?.data?.message ||
      err.message ||
      'Something went wrong'
    );
  }
  return 'Something went wrong';
}
