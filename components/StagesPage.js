"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function StagesPage() {
  const [stages, setStages] = useState([]);
  const [selectedStage, setSelectedStage] = useState("");
  const [draft, setDraft] = useState("");
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const templateRef = useRef(null);

  async function loadStages() {
    const response = await fetch("/api/stages");
    const data = await response.json();
    setStages(data.stages || []);
    const firstStage = selectedStage || data.stages?.[0]?.stage || "";
    const first = data.stages?.find((stage) => stage.stage === firstStage);
    setSelectedStage(firstStage);
    setDraft(first?.template || "");
    setDocuments(first?.documents || []);
  }

  useEffect(() => {
    loadStages();
  }, []);

  const selected = useMemo(
    () => stages.find((stage) => stage.stage === selectedStage) || null,
    [stages, selectedStage]
  );

  function selectStage(stage) {
    setSelectedStage(stage.stage);
    setDraft(stage.template || "");
    setDocuments(stage.documents || []);
    setNotice("");
  }

  const savedDocuments = useMemo(
    () => documents
      .map((document, index) => ({
        id: document.id || `document-${index + 1}`,
        title: document.title || `Document ${index + 1}`,
        content: document.content || ""
      }))
      .filter((document) => document.content.trim()),
    [documents]
  );

  function newDocumentId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `document-${Date.now()}`;
  }

  function addDocument() {
    setDocuments((items) => [
      ...items,
      { id: newDocumentId(), title: `Document ${items.length + 1}`, content: "" }
    ]);
  }

  function updateDocument(id, partial) {
    setDocuments((items) => items.map((item) => (item.id === id ? { ...item, ...partial } : item)));
  }

  function deleteDocument(id) {
    setDocuments((items) => items.filter((item) => item.id !== id));
  }

  async function importDocument(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setBusy(true);
    setNotice("");
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/stage-documents/import", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error || "Files could not be imported.");
        return;
      }

      const imported = (data.documents || []).map((document) => ({
        id: newDocumentId(),
        title: document.title,
        content: document.content
      }));
      setDocuments((items) => [...items, ...imported]);
      setNotice(data.errors?.length ? `Imported ${imported.length} file(s). ${data.errors.join(" ")}` : `Imported ${imported.length} file(s).`);
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  function insertIntoTemplate(content) {
    const editor = templateRef.current;
    const insertion = content.trim();
    if (!insertion) return;

    if (!editor) {
      setDraft((current) => `${current.trimEnd()}\n\n${insertion}`.trim());
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const needsBeforeSpace = before && !before.endsWith("\n") ? "\n" : "";
    const needsAfterSpace = after && !after.startsWith("\n") ? "\n" : "";
    const next = `${before}${needsBeforeSpace}${insertion}${needsAfterSpace}${after}`;
    setDraft(next);

    window.requestAnimationFrame(() => {
      editor.focus();
      const cursor = before.length + needsBeforeSpace.length + insertion.length;
      editor.setSelectionRange(cursor, cursor);
    });
  }

  function addDocumentToTemplate(document) {
    insertIntoTemplate(document.content || "");
    setNotice(`${document.title || "Document"} added to the template. Save to make it the default email.`);
  }

  function addAllDocumentsToTemplate() {
    const content = savedDocuments.map((document) => document.content.trim()).filter(Boolean).join("\n\n");
    if (!content) return;
    insertIntoTemplate(content);
    setNotice(`${savedDocuments.length} document(s) added to the template. Save to make it the default email.`);
  }

  async function saveTemplate() {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/stages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selected.stage, template: draft, documents: savedDocuments })
    });
    const data = await response.json();
    if (response.ok) {
      setStages(data.stages || []);
      setNotice("Template and files saved.");
    } else {
      setNotice(data.error || "Template could not be saved.");
    }
    setBusy(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Stages</h1>
        <span>Workflow phases, stage logic, and editable email templates</span>
      </header>

      <div className="stage-page">
        <section className="section">
          <div className="section-header">
            <h2>Workflow Steps</h2>
          </div>
          <div className="workflow-step-list">
            {stages.map((stage, index) => (
              <button
                key={stage.stage}
                className={selectedStage === stage.stage ? "workflow-step selected" : "workflow-step"}
                onClick={() => selectStage(stage)}
              >
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="step-copy">
                  <strong>{stage.stage}</strong>
                  <span>{stage.phase}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>{selected?.stage || "Template"}</h2>
            <button className="primary" disabled={busy || !selected} onClick={saveTemplate}>Save Template</button>
          </div>
          <div className="panel-body">
            {notice && <div className="notice ok">{notice}</div>}
            {selected && (
              <div className="stage-meta">
                <div>
                  <span className="label">phase</span>
                  <strong>{selected.phase}</strong>
                </div>
                <div>
                  <span className="label">next action logic</span>
                  <strong>{selected.nextAction || "-"}</strong>
                </div>
              </div>
            )}
            <div className="file-holder">
              <div className="file-holder-head">
                <span className="label">file holder</span>
                <div>
                  <label className="secondary file-import">
                    Upload file
                    <input type="file" multiple accept=".txt,.md,.csv,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocument} />
                  </label>
                  <button type="button" disabled={!savedDocuments.length} onClick={addAllDocumentsToTemplate}>Add All to Template</button>
                  <button type="button" onClick={addDocument}>Add Document</button>
                </div>
              </div>
              <div className="stage-documents">
                {documents.length ? (
                  documents.map((document, index) => (
                    <article key={document.id || index} className="stage-document">
                      <div className="stage-document-head">
                        <input
                          value={document.title || ""}
                          onChange={(event) => updateDocument(document.id, { title: event.target.value })}
                          placeholder={`Document ${index + 1}`}
                        />
                        <button type="button" onClick={() => addDocumentToTemplate(document)}>Add to Template</button>
                        <button type="button" className="danger" onClick={() => deleteDocument(document.id)}>Delete</button>
                      </div>
                      <textarea
                        className="document-editor"
                        value={document.content || ""}
                        onChange={(event) => updateDocument(document.id, { content: event.target.value })}
                        placeholder="Paste document text here."
                      />
                    </article>
                  ))
                ) : (
                  <div className="empty">No documents in this stage yet.</div>
                )}
              </div>
            </div>
            <label>
              <span className="label">email template</span>
              <textarea
                ref={templateRef}
                className="template-editor"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}
