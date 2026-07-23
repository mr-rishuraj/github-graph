import { formatDate } from './helpers';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export const MAX_RETRIES = 3;

export async function fetchData(url: string) {
  return fetch(url);
}
