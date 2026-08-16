"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { FlowRunDetail } from "@/lib/types";

export default function FlowRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [flowRun, setFlowRun] = useState<FlowRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    api
      .get<FlowRunDetail>(`/flow-runs/${id}`)
      .then(setFlowRun)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load record"));
  };

  useEffect(load, [id]);

  const resend = async () => {
    if (!confirm("Resend this record now? This will re-send the preliminary SMS and re-trigger the call.")) return;
    setResending(true);
    setError(null);
    try {
      await api.post(`/flow-runs/${id}/resend`, {});
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resend");
    } finally {
      setResending(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/flow-runs/${id}`);
      router.push("/flow-runs");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  if (error) return <div className="error">{error}</div>;
  if (!flowRun) return <p>Loading…</p>;

  return (
    <div>
      <h1>{flowRun.name}</h1>
      <p className="badge">{flowRun.status}</p>{" "}
      <span className={`badge ${flowRun.ctaCompleted ? "Completed" : ""}`}>
        {flowRun.ctaCompleted ? "CTA completed" : "CTA not completed"}
      </span>

      <div className="card">
        <h3>Details</h3>
        <p>Flow type: {flowRun.flowType}</p>
        <p>Phone: {flowRun.phone}</p>
        <p>MPL: {flowRun.mpl}</p>
        <p>Attempts so far: {flowRun.attemptCount}</p>
        {flowRun.ctaCompletedAt && (
          <p>CTA completed at: {new Date(flowRun.ctaCompletedAt).toLocaleString()}</p>
        )}
        {flowRun.cfaUrl && <p>CFA URL: {flowRun.cfaUrl}</p>}
        {flowRun.errorMessage && <p className="error">{flowRun.errorMessage}</p>}
        <div className="actions">
          <button onClick={resend} disabled={resending}>
            {resending ? "Resending…" : "Resend"}
          </button>
          <button onClick={remove} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {flowRun.calls.length > 0 && (
        <div className="card">
          <h3>Call history</h3>
          {flowRun.calls.map((call) => (
            <div key={call.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <p>{new Date(call.createdAt).toLocaleString()}</p>
              {call.summary && <p>{call.summary}</p>}
              {call.duration !== null && <p>Duration: {call.duration}s</p>}
              {call.conversationStatus && <p>Outcome: {call.conversationStatus}</p>}
              {!call.nlpearlCallId && <p>Call not yet completed.</p>}
              {call.recordingUrl && (
                <p>
                  <a href={call.recordingUrl} target="_blank" rel="noreferrer">
                    Recording
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Timeline</h3>
        <ul className="timeline">
          {flowRun.events.map((event) => (
            <li key={event.id}>
              <span>
                {event.status}
                {event.detail ? ` — ${event.detail}` : ""}
              </span>
              <span>{new Date(event.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
