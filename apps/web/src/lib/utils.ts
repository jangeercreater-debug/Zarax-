import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Standard shadcn/ui helper — merges Tailwind classes, letting later classes in the
 * list override earlier conflicting ones (e.g. a consumer overriding a component's
 * default padding) instead of both ending up in the class list unpredictably. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
