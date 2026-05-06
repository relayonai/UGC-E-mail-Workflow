import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

function asBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

export function getEmailConfig() {
  const mode = process.env.EMAIL_MODE || process.env.EMAIL_TRANSPORT || "mock";
  const real = mode === "real" || mode === "smtp";

  return {
    mode: real ? "real" : "mock",
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || "",
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      secure: asBoolean(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || ""
    },
    imap: {
      host: process.env.IMAP_HOST || "",
      port: Number(process.env.IMAP_PORT || 993),
      secure: asBoolean(process.env.IMAP_SECURE, true),
      user: process.env.IMAP_USER || process.env.SMTP_USER || "",
      pass: process.env.IMAP_PASS || process.env.SMTP_PASS || ""
    }
  };
}

export function getEmailStatus() {
  const config = getEmailConfig();
  return {
    mode: config.mode,
    from: config.from,
    smtpConfigured: Boolean(config.smtp.host && config.smtp.user && config.smtp.pass),
    imapConfigured: Boolean(config.imap.host && config.imap.user && config.imap.pass)
  };
}

function requireSmtp(config) {
  if (config.mode !== "real") return;
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass || !config.from) {
    throw new Error("Real email mode requires EMAIL_FROM, SMTP_HOST, SMTP_USER, and SMTP_PASS.");
  }
}

function requireImap(config) {
  if (config.mode !== "real") return;
  if (!config.imap.host || !config.imap.user || !config.imap.pass) {
    throw new Error("Inbox sync requires IMAP_HOST, IMAP_USER, and IMAP_PASS.");
  }
}

export function createThreadTag(creatorId) {
  return `[UGC-${creatorId}]`;
}

export function ensureSubjectTag(subject, creatorId) {
  const tag = createThreadTag(creatorId);
  return subject.includes(tag) ? subject : `${subject} ${tag}`;
}

export async function sendProviderEmail({ to, subject, body }) {
  const config = getEmailConfig();
  if (config.mode !== "real") {
    return {
      channel: "mock-email",
      providerMessageId: null,
      response: "mock"
    };
  }

  requireSmtp(config);

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });

  const result = await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text: body
  });

  return {
    channel: "smtp",
    providerMessageId: result.messageId || null,
    response: result.response || ""
  };
}

function emailAddress(value) {
  return value?.value?.[0]?.address || value?.text || "";
}

async function parseFetchedMessage(message) {
  const parsed = await simpleParser(message.source);
  return {
    uid: message.uid,
    messageId: parsed.messageId || `imap-${message.uid}`,
    from: emailAddress(parsed.from).toLowerCase(),
    subject: parsed.subject || "",
    body: (parsed.text || parsed.html || "").trim(),
    attachments: (parsed.attachments || []).map((attachment) => ({
      filename: attachment.filename || "attachment",
      contentType: attachment.contentType || "",
      size: attachment.size || 0
    })),
    receivedAt: (parsed.date || message.internalDate || new Date()).toISOString(),
    seen: Array.from(message.flags || []).includes("\\Seen")
  };
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export async function fetchRecentInboxMessages(days = 30) {
  const config = getEmailConfig();
  if (config.mode !== "real") {
    return [];
  }

  requireImap(config);

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: {
      user: config.imap.user,
      pass: config.imap.pass
    },
    logger: false
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const recent = await client.search({ since: daysAgo(days) });
      if (!recent.length) return [];

      const messages = [];
      for await (const message of client.fetch(recent, {
        envelope: true,
        flags: true,
        internalDate: true,
        source: true,
        uid: true
      })) {
        messages.push(await parseFetchedMessage(message));
      }
      return messages;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export async function fetchUnreadReplies() {
  return fetchRecentInboxMessages(Number(process.env.IMAP_SYNC_DAYS || 30));
}

export async function markMessagesSeen(uids) {
  if (!uids.length) return;

  const config = getEmailConfig();
  if (config.mode !== "real") return;

  requireImap(config);

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: {
      user: config.imap.user,
      pass: config.imap.pass
    },
    logger: false
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
