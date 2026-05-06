"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const emptyForm = {
  name: "",
  email: "",
  handle: "",
  platform: "",
  niche: ""
};

const EMAIL_FLOW_STEPS = [
  { stage: "First Touch Outreach", label: "First Touch", response: "Any reply" },
  { stage: "Meeting Setup", label: "Meeting Setup", response: "Call booked" },
  { stage: "After First Call", label: "After Call", response: "Reply" },
  { stage: "Content Brief Offer", label: "Offer", response: "Accepted / declined" },
  { stage: "No Offer", label: "No Offer", response: "Reply" },
  { stage: "Offer Acceptance Chase", label: "Acceptance Chase", response: "Accepted / declined" },
  { stage: "Pre-Invoice Chase", label: "Pre-Invoice", response: "Invoice sent" },
  { stage: "Content Chase", label: "Content Chase", response: "Content sent" },
  { stage: "Post-Invoice Chase", label: "Post-Invoice", response: "Invoice sent" },
  { stage: "Thank You + Final Check", label: "Final Check", response: "Approval" },
  { stage: "Repurposing Request", label: "Repurposing", response: "Reply" },
  { stage: "Retainer Offer", label: "Retainer", response: "Reply" }
];

const STATUS_ITEMS = [
  { key: "offer_status", label: "Offer", done: (value) => value === "accepted" },
  { key: "invoice_status", label: "Invoice", done: (value) => value === "received" },
  { key: "content_status", label: "Content", done: (value) => value === "received" },
  { key: "approval_status", label: "Approval", done: (value) => value === "approved" }
];

function statusPill(value) {
  if (["accepted", "received", "approved", "content sent", "invoice sent", "approval"].includes(value)) return "ok";
  if (["declined", "missing"].includes(value)) return "danger";
  return "warn";
}

function shortDate(value) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function longDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function messagePreview(value = "") {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function latestMessage(creator) {
  return creator.message_history?.[creator.message_history.length - 1] || null;
}

function latestInboundMessage(creator) {
  return [...(creator.message_history || [])].reverse().find((message) => message.direction === "inbound") || null;
}

function reviewTicks(message) {
  return message?.review?.checklist_updates || [];
}

function reviewSummary(message) {
  return message?.review?.summary || "";
}

function messageLabel(message) {
  if (message.direction === "outbound") return message.stage || "Email sent";
  return reviewTicks(message)[0]?.label || message.intent || "Reply received";
}

function messageTime(message) {
  return longDateTime(message.sent_at || message.received_at);
}

function syncUpdateCount(items) {
  return items.reduce((count, item) => count + (item.checklist_updates?.length || 0), 0);
}

function hasOutboundStage(creator, stage) {
  return (creator.message_history || []).some((message) => message.direction === "outbound" && message.stage === stage);
}

function stageSlug(stage) {
  return stage.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function hasInboundForStage(creator, stage) {
  const history = creator.message_history || [];
  const stageThread = `ugc-${creator.id}-${stageSlug(stage)}`;
  if (history.some((message) => message.direction === "inbound" && message.thread_id === stageThread)) return true;

  if (stage === "First Touch Outreach") return history.some((message) => message.direction === "inbound");
  if (stage === "Content Brief Offer") return ["accepted", "declined"].includes(creator.offer_status);
  if (stage === "Offer Acceptance Chase") return ["accepted", "declined"].includes(creator.offer_status);
  if (stage === "Pre-Invoice Chase") return creator.invoice_status === "received";
  if (stage === "Content Chase") return creator.content_status === "received";
  if (stage === "Post-Invoice Chase") return creator.invoice_status === "received" && creator.content_status === "received";
  if (stage === "Thank You + Final Check") return creator.approval_status === "approved";
  return false;
}

function flowStepState(creator, step) {
  const sent = hasOutboundStage(creator, step.stage);
  const received = hasInboundForStage(creator, step.stage);
  const current = creator.workflow_stage === step.stage;
  return { sent, received, current };
}

export default function Dashboard() {
  const [creators, setCreators] = useState([]);
  const [templates, setTemplates] = useState({});
  const [workflow, setWorkflow] = useState({});
  const [stages, setStages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [detailDraft, setDetailDraft] = useState(emptyForm);
  const [filters, setFilters] = useState({ search: "", stage: "", due: "" });
  const [emailBody, setEmailBody] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);
  const [syncResult, setSyncResult] = useState("");
  const [syncDetails, setSyncDetails] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [creatorResponse, templateResponse, emailResponse] = await Promise.all([
      fetch("/api/creators"),
      fetch("/api/templates"),
      fetch("/api/email/status")
    ]);
    const creatorData = await creatorResponse.json();
    const templateData = await templateResponse.json();
    const emailData = await emailResponse.json();
    setCreators(creatorData.creators || []);
    setTemplates(templateData.templates || {});
    setWorkflow(templateData.workflow || {});
    setStages(templateData.stages || []);
    setEmailStatus(emailData.email || null);
    if (creatorData.creators?.length && !creatorData.creators.some((creator) => creator.id === selectedId)) {
      setSelectedId(creatorData.creators[0].id);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const selected = useMemo(
    () => creators.find((creator) => creator.id === selectedId) || creators[0] || null,
    [creators, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    previewTemplate(selected.workflow_stage, selected);
    setDetailDraft({
      name: selected.name || "",
      email: selected.email || "",
      handle: selected.handle || "",
      platform: selected.platform || "",
      niche: selected.niche || ""
    });
  }, [selected?.id, selected?.workflow_stage, selected?.updated_at]);

  const filteredCreators = useMemo(() => {
    const query = filters.search.toLowerCase();
    return creators.filter((creator) => {
      const matchesSearch = !query || [creator.name, creator.email, creator.handle, creator.platform, creator.niche]
        .join(" ")
        .toLowerCase()
        .includes(query);
      const matchesStage = !filters.stage || creator.workflow_stage === filters.stage;
      const matchesDue = !filters.due || (creator.next_action_date && creator.next_action_date <= filters.due);
      return matchesSearch && matchesStage && matchesDue;
    });
  }, [creators, filters]);

  async function addCreator(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (data.creator) {
      setForm(emptyForm);
      setSelectedId(data.creator.id);
      await loadAll();
    }
    setBusy(false);
  }

  async function saveCreatorDetails(event) {
    event.preventDefault();
    await saveCreator(detailDraft);
  }

  async function deleteSelectedCreator() {
    if (!selected) return;
    const confirmed = window.confirm(`Delete ${selected.name} and all message history? This cannot be undone.`);
    if (!confirmed) return;

    setBusy(true);
    setError("");
    const response = await fetch(`/api/creators/${selected.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Creator could not be deleted");
      setBusy(false);
      return;
    }

    const remaining = creators.filter((creator) => creator.id !== selected.id);
    setCreators(remaining);
    setSelectedId(remaining[0]?.id || null);
    setEmailBody("");
    setBusy(false);
  }

  async function saveCreator(partial) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/creators/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial)
    });
    const data = await response.json();
    if (data.creator) {
      setCreators((items) => items.map((item) => (item.id === data.creator.id ? data.creator : item)));
    }
    setBusy(false);
  }

  async function previewTemplate(stage, creator = selected) {
    if (!creator) return;
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, creator })
    });
    const data = await response.json();
    setEmailBody(data.body || "");
  }

  async function sendCurrentEmail() {
    if (!selected || !emailBody.trim()) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/creators/${selected.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: selected.workflow_stage,
        subject: `Meet Warren UGC - ${selected.workflow_stage}`,
        body: emailBody
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Email failed to send");
      setBusy(false);
      return;
    }
    if (data.creator) {
      setCreators((items) => items.map((item) => (item.id === data.creator.id ? data.creator : item)));
    }
    setBusy(false);
  }

  async function syncInbox() {
    setBusy(true);
    setError("");
    setSyncResult("");
    setSyncDetails([]);
    const response = await fetch("/api/email/sync", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Inbox sync failed");
      setBusy(false);
      return;
    }
    setSyncResult(`Checked ${data.checked}; processed ${data.processed.length}; already saved ${data.alreadyImported?.length || 0}; ignored ${data.ignored || 0}; unmatched UGC threads ${data.unmatched.length}.`);
    setSyncDetails(data.processed || []);
    await loadAll();
    setBusy(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>UGC Creator Workflow</h1>
        <span>
          {emailStatus?.mode === "real"
            ? `Real email: ${emailStatus.from || "configured"}`
            : "Mock email mode"}
        </span>
      </header>

      <div className="workspace">
        <section className="section">
          <div className="section-header">
            <h2>Creator Sheet</h2>
            <button onClick={() => setFilters({ search: "", stage: "", due: "" })}>Clear filters</button>
          </div>

          <div className="toolbar">
            <input
              aria-label="Search creators"
              placeholder="Search creators"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
            <select
              aria-label="Filter by stage"
              value={filters.stage}
              onChange={(event) => setFilters({ ...filters, stage: event.target.value })}
            >
              <option value="">All stages</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
            <input
              aria-label="Due by date"
              type="date"
              value={filters.due}
              onChange={(event) => setFilters({ ...filters, due: event.target.value })}
            />
          </div>

          <div className="creator-cards">
            {filteredCreators.map((creator) => {
              const last = latestMessage(creator);
              const lastReply = latestInboundMessage(creator);
              return (
                <article
                  key={creator.id}
                  className={`creator-card ${selected?.id === creator.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(creator.id)}
                >
                  <div className="creator-card-top">
                    <strong>{creator.name}</strong>
                    <span className={`pill ${statusPill(creator.workflow_stage)}`}>{creator.workflow_stage}</span>
                  </div>
                  <div className="creator-card-meta">
                    <span>{creator.handle || creator.email}</span>
                    <span>{creator.platform || "No platform"}</span>
                  </div>
                  <div className="creator-card-status">
                    <span>Next: {creator.next_action || "-"}</span>
                    <span>Due: {shortDate(creator.next_action_date)}</span>
                  </div>
                  <div className="creator-card-footer">
                    <span>{creator.message_history?.length || 0} emails</span>
                    <span>{lastReply ? `reply: ${reviewTicks(lastReply)[0]?.label || lastReply.intent || "received"}` : last ? `${last.direction} ${shortDate(last.sent_at || last.received_at)}` : "No history"}</span>
                  </div>
                  <Link
                    className="detail-link"
                    href={`/creators/${creator.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    Open details
                  </Link>
                  <details className="flow-dropdown" onClick={(event) => event.stopPropagation()}>
                    <summary>Email flow</summary>
                    <div className="email-flow-grid">
                      {EMAIL_FLOW_STEPS.map((step, index) => {
                        const state = flowStepState(creator, step);
                        return (
                          <div key={step.stage} className={`email-flow-row ${state.current ? "current" : ""}`}>
                            <span className="flow-number">{index + 1}</span>
                            <strong>{step.label}</strong>
                            <span className={`flow-mini-box ${state.sent ? "done" : ""}`}>Sent</span>
                            <span className={`flow-mini-box ${state.received ? "done" : ""}`}>{step.response}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Handle</th>
                  <th>Platform</th>
                  <th>Niche</th>
                  <th>Stage</th>
                  <th>Next action</th>
                  <th>Action date</th>
                  <th>Offer</th>
                  <th>Invoice</th>
                  <th>Content</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {filteredCreators.map((creator) => (
                  <tr
                    key={creator.id}
                    className={selected?.id === creator.id ? "selected clickable-row" : "clickable-row"}
                    onClick={() => setSelectedId(creator.id)}
                  >
                    <td><button className="row-button" onClick={() => setSelectedId(creator.id)}>{creator.name}</button></td>
                    <td>{creator.email}</td>
                    <td>{creator.handle}</td>
                    <td>{creator.platform}</td>
                    <td>{creator.niche}</td>
                    <td>{creator.workflow_stage}</td>
                    <td>{creator.next_action}</td>
                    <td>{creator.next_action_date || "-"}</td>
                    <td><span className={`pill ${statusPill(creator.offer_status)}`}>{creator.offer_status}</span></td>
                    <td><span className={`pill ${statusPill(creator.invoice_status)}`}>{creator.invoice_status}</span></td>
                    <td><span className={`pill ${statusPill(creator.content_status)}`}>{creator.content_status}</span></td>
                    <td><span className={`pill ${statusPill(creator.approval_status)}`}>{creator.approval_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredCreators.length && <div className="empty">No creators match the current filters.</div>}
          </div>

          <form className="creator-form" onSubmit={addCreator}>
            {Object.keys(emptyForm).map((key) => (
              <label key={key}>
                <span className="label">{key.replace("_", " ")}</span>
                <input
                  required={key === "name" || key === "email"}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              </label>
            ))}
            <button className="primary" disabled={busy}>Add Creator</button>
          </form>
        </section>

        <div className="side-stack">
          <section className="section">
            <div className="section-header">
              <h3>{selected ? "Creator Workspace" : "Creator Workspace"}</h3>
              <div className="header-actions">
                {selected && <Link className="detail-link" href={`/creators/${selected.id}`}>Open Detail Page</Link>}
                <button disabled={busy || !emailStatus?.imapConfigured} onClick={syncInbox}>Sync Inbox</button>
              </div>
            </div>
            {selected ? (
              <div className="panel-body">
                {(() => {
                  const latestReply = latestInboundMessage(selected);
                  const latest = latestMessage(selected);
                  const updates = syncUpdateCount(syncDetails);
                  return (
                    <div className="workspace-console">
                      <div className="workspace-hero">
                        <div className="workspace-identity">
                          <span className="label">active creator</span>
                          <strong>{selected.name}</strong>
                          <span>{selected.email}</span>
                        </div>
                        <span className={`pill ${statusPill(selected.workflow_stage)}`}>{selected.workflow_stage}</span>
                      </div>

                      <div className="priority-box">
                        <div>
                          <span className="label">next action</span>
                          <strong>{selected.next_action || workflow[selected.workflow_stage]?.nextAction || "-"}</strong>
                        </div>
                        <div>
                          <span className="label">due</span>
                          <strong>{shortDate(selected.next_action_date)}</strong>
                        </div>
                        <div>
                          <span className="label">latest activity</span>
                          <strong>{latest ? `${messageLabel(latest)} · ${messageTime(latest)}` : "No emails yet"}</strong>
                        </div>
                      </div>

                      <div className="workspace-checklist">
                        {STATUS_ITEMS.map((item) => {
                          const value = selected[item.key] || "";
                          const done = item.done(value);
                          return (
                            <div key={item.key} className={done ? "check-card done" : "check-card"}>
                              <span className="check-dot">{done ? "✓" : ""}</span>
                              <div>
                                <span>{item.label}</span>
                                <strong>{value || "-"}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {error && <div className="notice danger">{error}</div>}
                      {syncResult && (
                        <div className="sync-summary">
                          <strong>{updates ? `${updates} checklist update(s) applied` : "Inbox sync complete"}</strong>
                          <span>{syncResult}</span>
                        </div>
                      )}
                      {syncDetails.length > 0 && (
                        <div className="sync-detail-list smart">
                          {syncDetails.map((item) => (
                            <div key={`${item.creator_id}-${item.subject}-${item.intent}`}>
                              <strong>{item.creator_name}</strong>
                              <span>{item.summary || item.intent || "received"} - {item.subject || item.from}</span>
                              {item.checklist_updates?.length > 0 && (
                                <div className="review-ticks compact">
                                  {item.checklist_updates.map((update) => (
                                    <span key={`${update.key}-${update.value}`} className="review-tick">{update.label}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {latestReply ? (
                        <div className="latest-response smart">
                          <div className="latest-response-head">
                            <div>
                              <span className="label">latest creator response</span>
                              <strong>{messageLabel(latestReply)}</strong>
                            </div>
                            <span className={`pill ${statusPill(latestReply.intent)}`}>{latestReply.intent || "received"}</span>
                          </div>
                          {latestReply.subject && <span className="latest-response-subject">{latestReply.subject}</span>}
                          {reviewSummary(latestReply) && <span className="review-summary">{reviewSummary(latestReply)}</span>}
                          {reviewTicks(latestReply).length > 0 && (
                            <div className="review-ticks">
                              {reviewTicks(latestReply).map((item) => (
                                <span key={`${item.key}-${item.value}`} className="review-tick">{item.label}</span>
                              ))}
                            </div>
                          )}
                          <pre>{latestReply.body}</pre>
                        </div>
                      ) : (
                        <div className="empty compact-empty">No creator replies yet.</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="empty">Select a creator card to open their workspace.</div>
            )}
          </section>

          <section className="section">
            <div className="section-header">
              <h3>{selected ? selected.name : "Creator Detail"}</h3>
              {selected && (
                <div className="header-actions">
                  <span className={`pill ${statusPill(selected.workflow_stage)}`}>{selected.workflow_stage}</span>
                  <button className="danger-button" disabled={busy} onClick={deleteSelectedCreator}>Delete</button>
                </div>
              )}
            </div>
            {selected ? (
              <form className="detail-grid" onSubmit={saveCreatorDetails}>
                {Object.keys(emptyForm).map((key) => (
                  <label key={key}>
                    <span className="label">{key.replace("_", " ")}</span>
                    <input
                      required={key === "name" || key === "email"}
                      value={detailDraft[key]}
                      onChange={(event) => setDetailDraft({ ...detailDraft, [key]: event.target.value })}
                    />
                  </label>
                ))}
                <button className="primary full" disabled={busy}>Save Creator Details</button>

                <label>
                  <span className="label">workflow stage</span>
                  <select
                    value={selected.workflow_stage}
                    onChange={(event) => saveCreator({ workflow_stage: event.target.value })}
                  >
                    {stages.map((stage) => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">next action date</span>
                  <input
                    type="date"
                    value={selected.next_action_date || ""}
                    onChange={(event) => saveCreator({ next_action_date: event.target.value })}
                  />
                </label>
                {["offer_status", "invoice_status", "content_status", "approval_status"].map((key) => (
                  <label key={key}>
                    <span className="label">{key.replace("_", " ")}</span>
                    <input
                      value={selected[key] || ""}
                      onChange={(event) => saveCreator({ [key]: event.target.value })}
                    />
                  </label>
                ))}
                <label className="full">
                  <span className="label">next action</span>
                  <input
                    value={selected.next_action || ""}
                    onChange={(event) => saveCreator({ next_action: event.target.value })}
                  />
                </label>
                <div className="full">
                  <span className="label">stage logic</span>
                  <div>{workflow[selected.workflow_stage]?.nextAction || "-"}</div>
                </div>
              </form>
            ) : (
              <div className="empty">Add a creator to start the workflow.</div>
            )}
          </section>

          <section className="section">
            <div className="section-header">
              <h3>Email Actions</h3>
            </div>
            <div className="panel-body">
              {emailStatus?.mode === "real" ? (
                <div className="notice ok">
                  SMTP {emailStatus.smtpConfigured ? "configured" : "missing"} · IMAP {emailStatus.imapConfigured ? "configured" : "missing"}
                </div>
              ) : (
                <div className="notice warn">Mock mode is active. Add `.env.local` email settings and restart to send from Warren email.</div>
              )}
              <label>
                <span className="label">editable template before sending</span>
                <textarea
                  className="template-editor"
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                />
              </label>
              <div className="email-actions">
                <button className="primary" disabled={busy || !selected} onClick={sendCurrentEmail}>Send Current Stage Email</button>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h3>Previous Emails</h3>
              {selected?.message_history?.length ? <span className="section-count">{selected.message_history.length} total</span> : null}
            </div>
            <div className="panel-body email-timeline">
              {selected?.message_history?.length ? (
                [...selected.message_history].reverse().map((message) => (
                  <article key={message.id} className={`timeline-message ${message.direction}`}>
                    <div className="timeline-marker" aria-hidden="true" />
                    <div className="timeline-card">
                      <div className="timeline-top">
                        <div>
                          <span className="timeline-kicker">{message.direction === "outbound" ? "Sent email" : "Creator reply"}</span>
                          <strong>{messageLabel(message)}</strong>
                        </div>
                        <span>{messageTime(message)}</span>
                      </div>
                      {message.subject && <span className="message-subject">{message.subject}</span>}
                      <div className="timeline-meta-row">
                        {message.channel && <span>{message.channel}</span>}
                        {message.attachments?.length ? <span>{message.attachments.length} attachment(s)</span> : null}
                        {message.intent && message.direction === "inbound" ? <span>{message.intent}</span> : null}
                      </div>
                      {reviewSummary(message) && <span className="review-summary">{reviewSummary(message)}</span>}
                      {reviewTicks(message).length > 0 && (
                        <div className="review-ticks">
                          {reviewTicks(message).map((item) => (
                            <span key={`${item.key}-${item.value}`} className="review-tick">{item.label}</span>
                          ))}
                        </div>
                      )}
                      <p>{messagePreview(message.body)}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty">No messages yet.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
