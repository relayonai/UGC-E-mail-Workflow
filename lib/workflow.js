export const STAGE_DEFINITIONS = [
  {
    stage: "First Touch Outreach",
    phase: "Outreach",
    followUpDays: 7,
    nextAction: "Send first outreach and wait for a reply or booked intro call"
  },
  {
    stage: "Meeting Setup",
    phase: "Outreach",
    followUpDays: null,
    nextAction: "Confirm the intro call is booked and prepare call notes"
  },
  {
    stage: "After First Call",
    phase: "Qualification",
    followUpDays: null,
    nextAction: "Send post-call recap and prepare offer decision"
  },
  {
    stage: "Content Brief Offer",
    phase: "Offer",
    followUpDays: 7,
    nextAction: "Send the official offer and wait for accepted or no"
  },
  {
    stage: "No Offer",
    phase: "Offer",
    followUpDays: null,
    nextAction: "Close current outreach and keep creator for future reference"
  },
  {
    stage: "Offer Acceptance Chase",
    phase: "Offer",
    followUpDays: 7,
    nextAction: "Chase offer acceptance one week after no reply"
  },
  {
    stage: "Pre-Invoice Chase",
    phase: "Production",
    followUpDays: 7,
    nextAction: "Request the first 50% invoice after acceptance"
  },
  {
    stage: "Content Chase",
    phase: "Production",
    followUpDays: 7,
    nextAction: "Request content after invoice/payment if content has not arrived"
  },
  {
    stage: "Post-Invoice Chase",
    phase: "Payment",
    followUpDays: 7,
    nextAction: "Request the remaining 50% invoice after content is approved"
  },
  {
    stage: "Thank You + Final Check",
    phase: "Approval",
    followUpDays: 3,
    nextAction: "Send final edit and ask for approval before publishing"
  },
  {
    stage: "Repurposing Request",
    phase: "Expansion",
    followUpDays: 7,
    nextAction: "Request permission and compensation terms for reuse or new placement"
  },
  {
    stage: "Retainer Offer",
    phase: "Expansion",
    followUpDays: 7,
    nextAction: "Offer monthly retainer to creators you want to keep working with"
  }
];

export const WORKFLOW_STAGES = STAGE_DEFINITIONS.map((definition) => definition.stage);

export const STAGE_PHASES = Object.fromEntries(
  STAGE_DEFINITIONS.map((definition) => [definition.stage, definition.phase])
);

export const WORKFLOW_PHASES = [...new Set(STAGE_DEFINITIONS.map((definition) => definition.phase))];

export const WORKFLOW = Object.fromEntries(
  STAGE_DEFINITIONS.map((definition) => [
    definition.stage,
    {
      templateKey: definition.stage,
      followUpDays: definition.followUpDays,
      nextAction: definition.nextAction
    }
  ])
);

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export function computeNextAction(creator, now = new Date()) {
  const config = WORKFLOW[creator.workflow_stage] || WORKFLOW["First Touch Outreach"];
  let nextAction = config.nextAction;
  let nextActionDate = null;

  if (config.followUpDays && creator.last_email_sent) {
    nextActionDate = addDays(creator.last_email_sent, config.followUpDays);
  }

  if (creator.last_email_sent && !creator.last_reply) {
    const sentAt = new Date(creator.last_email_sent);
    const daysSinceEmail = Math.floor((now - sentAt) / 86400000);
    if (daysSinceEmail >= 7) {
      if (creator.workflow_stage === "Content Brief Offer") {
        return {
          next_action: "Suggest Offer Acceptance Chase",
          next_action_date: now.toISOString().slice(0, 10)
        };
      }
      return {
        next_action: "Suggest chase: no reply after 7 days",
        next_action_date: now.toISOString().slice(0, 10)
      };
    }
  }

  return {
    next_action: nextAction,
    next_action_date: nextActionDate
  };
}

export function detectIntent(text = "") {
  const value = text.toLowerCase();
  if (/\b(accepted|accept|happy to go ahead|sounds good|yes|confirm)\b/.test(value)) {
    return "accepted";
  }
  if (/\b(no|decline|declined|not interested|pass|can't|cannot)\b/.test(value)) {
    return "declined";
  }
  if (/\b(invoice|invoiced|billing)\b/.test(value)) {
    return "invoice sent";
  }
  if (/\b(content|video|rushes|files|uploaded|drive|dropbox|wetransfer|attached)\b/.test(value)) {
    return "content sent";
  }
  if (/\b(approved|approve|approval|looks good|all good|fine to publish)\b/.test(value)) {
    return "approval";
  }
  if (value.includes("?") || /\b(question|clarify|wondering|can you|could you|how do)\b/.test(value)) {
    return "question";
  }
  return "question";
}

export function applyIntentToCreator(creator, intent) {
  const update = { ...creator };

  if (creator.workflow_stage === "First Touch Outreach" && ["accepted", "question"].includes(intent)) {
    update.workflow_stage = "Meeting Setup";
    update.next_action = "Confirm the intro call is booked and prepare call notes";
    return update;
  }

  if (intent === "accepted") {
    update.offer_status = "accepted";
    update.invoice_status = update.invoice_status === "received" ? "received" : "missing";
    update.workflow_stage = "Pre-Invoice Chase";
    update.next_action = "Request the first 50% invoice";
  }

  if (intent === "declined") {
    update.offer_status = "declined";
    update.workflow_stage = "No Offer";
    update.next_action = "Send no-offer closeout or keep creator for future reference";
  }

  if (intent === "invoice sent") {
    update.invoice_status = "received";
    update.workflow_stage = update.content_status === "received" ? "Post-Invoice Chase" : "Content Chase";
    update.next_action = update.content_status === "received" ? "Request final invoice if needed" : "Wait for content delivery";
  }

  if (intent === "content sent") {
    update.content_status = "received";
    update.approval_status = "pending";
    update.workflow_stage = "Thank You + Final Check";
    update.next_action = "Review content and send final check";
  }

  if (intent === "approval") {
    update.approval_status = "approved";
    update.workflow_stage = "Post-Invoice Chase";
    update.next_action = "Request remaining invoice";
  }

  if (intent === "question") {
    update.next_action = "Reply to creator question";
  }

  return update;
}

export function suggestStageFromCreator(creator) {
  if (creator.workflow_stage === "First Touch Outreach" && creator.last_reply) {
    return "Meeting Setup";
  }
  if (creator.offer_status === "accepted" && creator.invoice_status !== "received") {
    return "Pre-Invoice Chase";
  }
  if (creator.invoice_status === "received" && creator.content_status !== "received") {
    return "Content Chase";
  }
  if (creator.content_status === "received" && creator.approval_status === "approved") {
    return "Post-Invoice Chase";
  }
  return creator.workflow_stage;
}
