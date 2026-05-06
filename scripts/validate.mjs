import { createCreator, deleteCreator, getCreator, updateCreator } from "../lib/db.js";
import { receiveReply, sendEmail } from "../lib/emailService.js";
import { getTemplates, renderTemplate } from "../lib/templates.js";

const creator = createCreator({
  name: `Test Creator ${Date.now()}`,
  email: `test.creator.${Date.now()}@example.com`,
  handle: "@testcreator",
  platform: "TikTok",
  niche: "personal finance"
});

const templates = getTemplates();
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

const assertions = [
  ["creator exists", Boolean(finalCreator)],
  ["message history saved", finalCreator.message_history.length === 6],
  ["accepted intent updated offer", finalCreator.offer_status === "accepted"],
  ["invoice received", finalCreator.invoice_status === "received"],
  ["content received", finalCreator.content_status === "received"],
  ["stage moved through content flow", finalCreator.workflow_stage === "Thank You + Final Check"],
  ["meeting setup absent", !["Meeting Setup"].includes(finalCreator.workflow_stage)]
];

for (const [label, ok] of assertions) {
  if (!ok) {
    throw new Error(`Validation failed: ${label}`);
  }
}

console.log("Validation passed");
console.log(`Creator: ${finalCreator.name}`);
console.log(`Stage: ${finalCreator.workflow_stage}`);
console.log(`Messages: ${finalCreator.message_history.length}`);

deleteCreator(finalCreator.id);
