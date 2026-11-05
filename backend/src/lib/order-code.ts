import { randomInt } from "crypto";

// Letters and digits that are hard to confuse (no 0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

// Creates a short order code such as "CV7K2QXM".
export function generateOrderCode(): string {
  let code = "CV";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
