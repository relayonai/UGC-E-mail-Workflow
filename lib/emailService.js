import { appendMessage, findCreatorByEmail, getCreator, hasProviderMessage, updateCreator } from "./db.js";
import {
  ensureSubjectTag,
  fetchRecentInboxMessages,
  markMessagesSeen,
  sendProviderEmail
} from "./emailProvider.js";
import { computeNextAction, detectIntent, reviewInboundEmail } from "./workflow.js";

export function matchThread(creator, inbound = {}) {
  const lastOutbound = [...(creator.message_history || [])].reverse().find((message) => message.direction === "outbound");
  return inbound.thread_id || lastOutbound?.thread_id || `ugc-${creator.id}`;
}

function findCreatorForInbound(message) {
  const tagged = message.subject.match(/\[UGC-(\d+)\]/i);
  if (tagged) {
    return getCreator(tagged[1]);
  }
  return findCreatorByEmail(message.from);
}

function hasThreadTag(message) {
  return /\[UGC-(\d+)\]/i.test(message.subject || "");
}

function latestReplyText(body = "") {
  const withoutQuotedLines = body
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");

  return withoutQuotedLines
    .split(/\nOn .+ wrote:\n/i)[0]
    .split(/\nFrom:\s.+\n/i)[0]
    .split(/\n-{2,}\s*Original Message\s*-{2,}/i)[0]
    .trim() || body.trim();
}

export async function sendEmail(creator, { subject, body, stage }) {
  const now = new Date().toISOString();
  const activeStage = stage || creator.workflow_stage;
  const threadId = `ugc-${creator.id}-${activeStage.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const taggedSubject = ensureSubjectTag(subject, creator.id);
  const providerResult = await sendProviderEmail({
    to: creator.email,
    subject: taggedSubject,
    body
  });

  const next = computeNextAction({
    ...creator,
    workflow_stage: activeStage,
    last_email_sent: now
  });

  return appendMessage(
    creator.id,
    {
      direction: "outbound",
      subject: taggedSubject,
      body,
      stage: activeStage,
      thread_id: threadId,
      provider_message_id: providerResult.providerMessageId,
      sent_at: now,
      channel: providerResult.channel,
      provider_response: providerResult.response
    },
    {
      workflow_stage: activeStage,
      last_email_sent: now,
      next_action: next.next_action,
      next_action_date: next.next_action_date
    }
  );
}

export function receiveReply(creatorId, {
  body,
  from,
  channel = "manual",
  provider_message_id = null,
  received_at = null,
  subject = "",
  attachments = []
}) {
  const creator = getCreator(creatorId);
  if (!creator) return null;

  const now = received_at || new Date().toISOString();
  const cleanBody = latestReplyText(body);
  const threadId = matchThread(creator, {});
  const review = reviewInboundEmail(creator, {
    body: cleanBody,
    subject,
    attachments
  });

  return appendMessage(
    creator.id,
    {
      direction: "inbound",
      from: from || creator.email,
      subject,
      body: cleanBody,
      intent: review.intent,
      review: {
        summary: review.summary,
        checklist_updates: review.checklist_updates,
        signals: review.signals
      },
      attachments,
      thread_id: threadId,
      provider_message_id,
      received_at: now,
      channel
    },
    {
      ...review.update,
      last_reply: now
    }
  );
}

export function advanceStage(creatorId, workflow_stage) {
  const creator = getCreator(creatorId);
  if (!creator) return null;
  return updateCreator(creatorId, { workflow_stage });
}

export async function syncInboxReplies() {
  const messages = await fetchRecentInboxMessages(Number(process.env.IMAP_SYNC_DAYS || 30));
  const matchedUids = [];
  const processed = [];
  const unmatched = [];
  const alreadyImported = [];
  let ignored = 0;

  for (const message of messages) {
    if (hasProviderMessage(message.messageId)) {
      alreadyImported.push({
        from: message.from,
        subject: message.subject,
        received_at: message.receivedAt
      });
      if (!message.seen) matchedUids.push(message.uid);
      continue;
    }

    const creator = findCreatorForInbound(message);
    if (!creator) {
      if (hasThreadTag(message)) {
        unmatched.push({
          from: message.from,
          subject: message.subject,
          received_at: message.receivedAt
        });
      } else {
        ignored += 1;
      }
      continue;
    }

    const updated = receiveReply(creator.id, {
      body: message.body,
      from: message.from,
      subject: message.subject,
      attachments: message.attachments || [],
      channel: "imap",
      provider_message_id: message.messageId,
      received_at: message.receivedAt
    });

    const lastMessage = updated.message_history[updated.message_history.length - 1];
    if (!message.seen) matchedUids.push(message.uid);
    processed.push({
      creator_id: creator.id,
      creator_name: creator.name,
      from: message.from,
      subject: message.subject,
      intent: lastMessage?.intent,
      summary: lastMessage?.review?.summary || "",
      checklist_updates: lastMessage?.review?.checklist_updates || []
    });
  }

  await markMessagesSeen(matchedUids);

  return {
    checked: messages.length,
    processed,
    unmatched,
    alreadyImported,
    ignored
  };
}

export { detectIntent };
