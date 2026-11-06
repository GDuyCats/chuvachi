// Creates an admin account, or resets the password of an existing one.
// Run from the backend folder:  yarn create-admin
// The password is typed in hidden and is never shown or saved in plain text.

import "dotenv/config";
import { createInterface } from "readline";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Print the question, then hide every character the user types.
    const writable = rl as unknown as { _writeToOutput: (text: string) => void };
    let questionShown = false;
    writable._writeToOutput = (text: string) => {
      if (!questionShown) {
        process.stdout.write(text);
        questionShown = true;
      }
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const email = (await ask("Admin email: ")).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("That doesn't look like an email address.");
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  const name = existing ? existing.name : await ask("Display name: ");
  if (!name) {
    throw new Error("A display name is required.");
  }

  const password = await ask(`Password (at least ${MIN_PASSWORD_LENGTH} characters, hidden): `, true);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const repeat = await ask("Repeat the password: ", true);
  if (repeat !== password) {
    throw new Error("The two passwords don't match.");
  }

  const passwordHash = await hashPassword(password);
  if (existing) {
    // New password: unlock the account and sign out every browser that used the old one.
    await prisma.$transaction([
      prisma.adminUser.update({
        where: { id: existing.id },
        data: { passwordHash, isActive: true, failedLogins: 0, lockedUntil: null },
      }),
      prisma.adminSession.deleteMany({ where: { adminUserId: existing.id } }),
    ]);
    console.log(`Password updated for ${email}.`);
  } else {
    await prisma.adminUser.create({ data: { email, name, passwordHash } });
    console.log(`Admin account created for ${email}.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
