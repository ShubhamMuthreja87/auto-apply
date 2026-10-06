/**
 * Prints a bcrypt hash (cost 12, D26) for `AUTH_PASSWORD_HASH`. The password
 * is read from stdin, so it never lands in shell history or `ps`:
 *
 *   npm -w @auto-apply/api run hash-password
 */
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";

const rl = createInterface({ input: process.stdin, output: process.stderr });
const password = await rl.question("Password: ");
rl.close();

if (password.length === 0) {
  process.stderr.write("No password given.\n");
  process.exit(1);
}

process.stdout.write(`${await bcrypt.hash(password, 12)}\n`);
