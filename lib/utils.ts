import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d?: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${dt.getMonth() + 1}/${dt.getDate()}（${days[dt.getDay()]}）`;
}

export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}
