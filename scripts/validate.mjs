import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCreator, deleteCreator, findCreatorByEmail, getCreator, updateCreator } from "../lib/db.js";
import { receiveReply, sendEmail } from "../lib/emailService.js";
import { syncCreatorsWithSpreadsheet } from "../lib/spreadsheetSync.js";
import { getTemplates, renderTemplate } from "../lib/templates.js";

const creator = createCreator({
  name: `Test Creator ${Date.now()}`,
  email: `test.creator.${Date.now()}@example.com`,
  handle: "@testcreator",
  platform: "TikTok",
  niche: "personal finance"
});

const templates = getTemplates();
if (!templates["After First Call"]?.includes("Thank you again for taking the time to chat today")) {
  throw new Error("Validation failed: After First Call template did not import from the After Interview section");
}

const firstBody = renderTemplate(templates["First Touch Outreach"], creator);
await sendEmail(creator, {
  stage: "First Touch Outreach",
  subject: "Meet Warren UGC",
  body: firstBody
});

const afterCall = updateCreator(creator.id, { workflow_stage: "After First Call" });
const afterCallBody = renderTemplate(templates["After First Call"], afterCall);
await sendEmail(afterCall, {
  stage: "After First Call",
  subject: "Great speaking today",
  body: afterCallBody
});

const offer = updateCreator(creator.id, { workflow_stage: "Content Brief Offer" });
const offerBody = renderTemplate(templates["Content Brief Offer"], offer, { date: "2026-05-15" });
await sendEmail(offer, {
  stage: "Content Brief Offer",
  subject: "Meet Warren content brief",
  body: offerBody
});

receiveReply(creator.id, { body: "Accepted, happy to go ahead." });
receiveReply(creator.id, { body: "Invoice attached." });
receiveReply(creator.id, { body: "I uploaded the content files to Drive." });

const finalCreator = getCreator(creator.id);
const inboundMessages = finalCreator.message_history.filter((message) => message.direction === "inbound");
const invoiceMessage = inboundMessages.find((message) => message.intent === "invoice sent");
const contentMessage = inboundMessages.find((message) => message.intent === "content sent");

const assertions = [
  ["creator exists", Boolean(finalCreator)],
  ["message history saved", finalCreator.message_history.length === 6],
  ["accepted intent updated offer", finalCreator.offer_status === "accepted"],
  ["invoice received", finalCreator.invoice_status === "received"],
  ["content received", finalCreator.content_status === "received"],
  ["stage moved through content flow", finalCreator.workflow_stage === "Thank You + Final Check"],
  ["meeting setup absent", !["Meeting Setup"].includes(finalCreator.workflow_stage)],
  ["invoice review saved", invoiceMessage?.review?.checklist_updates?.some((item) => item.label === "Invoice received")],
  ["content review saved", contentMessage?.review?.checklist_updates?.some((item) => item.label === "Content received")]
];

for (const [label, ok] of assertions) {
  if (!ok) {
    throw new Error(`Validation failed: ${label}`);
  }
}

deleteCreator(finalCreator.id);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-csv-sync-"));
const csvPath = path.join(tempDir, "creators.csv");
fs.writeFileSync(
  csvPath,
  [
    "Creator Contact List,,,,,,,,",
    ",,,,,,,,",
    "Name,Contact,\"Handle\n[if applicable]\",Format,Outreach message sent?,\"Meeting set up?\n[if applicable]\",Meeting notes,Outcome,notes",
    "CSV Creator,csv.creator@example.com,@csvcreator,Finance,TRUE,Yes,,Proceeding,"
  ].join("\n"),
  "utf8"
);

process.env.UGC_CREATORS_CSV_PATH = csvPath;
const csvSync = await syncCreatorsWithSpreadsheet({ forceImport: true });
const csvCreator = findCreatorByEmail("csv.creator@example.com");
const syncedCsv = fs.readFileSync(csvPath, "utf8");
const csvAssertions = [
  ["csv imported creator", csvSync.imported >= 1 || csvSync.updated >= 1],
  ["csv creator exists", Boolean(csvCreator)],
  ["csv wrote tool id", syncedCsv.includes("Tool ID")],
  ["csv preserved legacy notes", syncedCsv.includes("Proceeding")]
];

for (const [label, ok] of csvAssertions) {
  if (!ok) {
    throw new Error(`Validation failed: ${label}`);
  }
}

if (csvCreator) deleteCreator(csvCreator.id);
fs.rmSync(tempDir, { recursive: true, force: true });

console.log("Validation passed");
console.log(`Creator: ${finalCreator.name}`);
console.log(`Stage: ${finalCreator.workflow_stage}`);
console.log(`Messages: ${finalCreator.message_history.length}`);
