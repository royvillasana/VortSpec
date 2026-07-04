import { nanoid } from "nanoid";

export type IdPrefix = "tok" | "cmp" | "nod" | "iss" | "pat" | "scr" | "thm";

export function generateId(prefix: IdPrefix): string {
  return `${prefix}_${nanoid(12)}`;
}
