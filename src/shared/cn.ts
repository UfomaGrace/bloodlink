// cn: joins Tailwind class names and resolves conflicts (clsx + tailwind-merge)
// Owner: Muizz
// - [ ] Accepts any number of class values, returns one string

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
