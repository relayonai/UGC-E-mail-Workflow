import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const envPath = new URL("../.env.local", import.meta.url);

if (!fs.existsSync(envPath)) {
  throw new Error(".env.local was not found. Run this from the project after .env.local has been created.");
}

const rl = readline.createInterface({ input, output });

output.write("Paste Google App Password. Input is hidden: ");
input.setRawMode?.(true);

let password = "";
for await (const chunk of input) {
  const char = chunk.toString("utf8");
  if (char === "\r" || char === "\n") break;
  if (char === "\u0003") {
    output.write("\nCancelled.\n");
    process.exit(1);
  }
  if (char === "\u007f") {
    password = password.slice(0, -1);
    continue;
  }
  password += char;
}

input.setRawMode?.(false);
output.write("\n");
rl.close();

password = password.replace(/\s/g, "");

if (!password || password.length < 12) {
  throw new Error("That password looked too short. Use the 16-character Google App Password.");
}

let env = fs.readFileSync(envPath, "utf8");
env = env.replace(/^SMTP_PASS=.*$/m, `SMTP_PASS=${password}`);
env = env.replace(/^IMAP_PASS=.*$/m, `IMAP_PASS=${password}`);
fs.writeFileSync(envPath, env);

console.log("Saved Google App Password to SMTP_PASS and IMAP_PASS in .env.local.");
