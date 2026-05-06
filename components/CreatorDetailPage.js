"use client";

import { useEffect, useState } from "react";

function shortDate(value) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function latestInboundMessage(creator) {
  return [...(creator?.message_history || [])].reverse().find((message) => message.direction === "inbound") || null;
}

export default function CreatorDetailPage({ creatorId }) {
  const [creator, setCreator] = useState(null);
  const [stages, setStages] = useState([]);
  const [emailBody, setEmailBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadCreator() {
    const [creatorResponse, templateResponse] = await Promise.all([
      fetch(`/api/creators/${creatorId}`),
      fetch("/api/templates")
    ]);
    const creatorData = await creatorResponse.json();
    const templateData = await templateResponse.json();
    if (creatorData.creator) {
      setCreator(creatorData.creator);
      setStages(templateData.stages || []);
      const template = templateData.templates?.[creatorData.creator.workflow_stage] || "";
      const rendered = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: creatorData.creator.workflow_stage, creator: creatorData.creator })
      }).then((response) => response.json());
      setEmailBody(rendered.body || template);
    }
  }

  useEffect(() => {
    loadCreator();
  }, [creatorId]);

  async function changeStage(workflowStage) {
    setBusy(true);
    setNotice("");
    const response = await fetch(`/api/creators/${creator.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_stage: workflowStage })
    });
    const data = await response.json();
    if (data.creator) {
      setCreator(data.creator);
      const rendered = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: data.creator.workflow_stage, creator: data.creator })
      }).then((item) => item.json());
      setEmailBody(rendered.body || "");
    }
    setBusy(false);
  }

  async function sendEmail() {
    if (!creator || !emailBody.trim()) return;
    setBusy(true);
    setNotice("");
    const response = await fetch(`/api/creators/${creator.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: creator.workflow_stage,
        subject: `Meet Warren UGC - ${creator.workflow_stage}`,
        body: emailBody
      })
    });
    const data = await response.json();
    if (data.creator) {
      setCreator(data.creator);
      setNotice("Email sent and saved to history.");
    } else {
      setNotice(data.error || "Email could not be sent.");
    }
    setBusy(false);
  }

  async function syncInbox() {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/email/sync", { method: "POST" });
    const data = await response.json();
    setNotice(response.ok ? `Inbox synced. Processed ${data.processed.length} matched replies.` : data.error);
    await loadCreator();
    setBusy(false);
  }

  if (!creator) {
    return (
      <main className="app-shell">
        <header className="topbar"><h1>Creator Detail</h1></header>
        <div className="empty">Loading creator...</div>
      </main>
    );
  }

  const latestReply = latestInboundMessage(creator);

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>{creator.name}</h1>
        <span>{creator.email}</span>
      </header>

      <div className="creator-detail-page">
        <section className="section">
          <div className="section-header">
            <h2>Creator Status</h2>
            <button disabled={busy} onClick={syncInbox}>Sync Inbox</button>
          </div>
          <div className="panel-body">
            {notice && <div className="notice ok">{notice}</div>}
            <div className="status-grid">
              <div><span className="label">stage</span><strong>{creator.workflow_stage}</strong></div>
              <div><span className="label">next action</span><strong>{creator.next_action || "-"}</strong></div>
              <div><span className="label">offer</span><strong>{creator.offer_status}</strong></div>
              <div><span className="label">invoice</span><strong>{creator.invoice_status}</strong></div>
              <div><span className="label">content</span><strong>{creator.content_status}</strong></div>
              <div><span className="label">approval</span><strong>{creator.approval_status}</strong></div>
            </div>
            {latestReply && (
              <div className="latest-response">
                <div className="latest-response-head">
                  <strong>Latest response</strong>
                  <span className="pill ok">{latestReply.intent || "received"}</span>
                </div>
                <pre>{latestReply.body}</pre>
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Email Template Before Send</h2>
            <button className="primary" disabled={busy} onClick={sendEmail}>Send Email</button>
          </div>
          <div className="panel-body">
            <label>
              <span className="label">stage</span>
              <select value={creator.workflow_stage} onChange={(event) => changeStage(event.target.value)}>
                {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
            <label>
              <span className="label">editable message</span>
              <textarea
                className="template-editor"
                value={emailBody}
                onChange={(event) => setEmailBody(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="section full">
          <div className="section-header">
            <h2>Message History</h2>
          </div>
          <div className="panel-body message-list tall">
            {[...creator.message_history].reverse().map((message) => (
              <article key={message.id} className="message">
                <div className="message-meta">
                  <span>{message.direction} {message.intent ? `- ${message.intent}` : ""}</span>
                  <span>{shortDate(message.sent_at || message.received_at)}</span>
                </div>
                {message.subject && <strong className="message-subject">{message.subject}</strong>}
                <pre>{message.body}</pre>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
