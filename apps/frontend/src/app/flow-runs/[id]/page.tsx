"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { FlowRunDetail } from "@/lib/types";

export default function FlowRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [flowRun, setFlowRun] = useState<FlowRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FlowRunDetail>(`/flow-runs/${id}`)
      .then(setFlowRun)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load record"));
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!flowRun) return <p>Loading…</p>;

  return (
    <div>
      <h1>{flowRun.name}</h1>
      <p className="badge">{flowRun.status}</p>

      <div className="card">
        <h3>Details</h3>
        <p>Flow type: {flowRun.flowType}</p>
        <p>Phone: {flowRun.phone}</p>
        <p>MPL: {flowRun.mpl}</p>
        {flowRun.cfaUrl && <p>CFA URL: {flowRun.cfaUrl}</p>}
        {flowRun.errorMessage && <p className="error">{flowRun.errorMessage}</p>}
      </div>

      {flowRun.summary && (
        <div className="card">
          <h3>Call summary</h3>
          <p>{flowRun.summary}</p>
          {flowRun.duration !== null && <p>Duration: {flowRun.duration}s</p>}
          {flowRun.conversationStatus && <p>Outcome: {flowRun.conversationStatus}</p>}
          {flowRun.recordingUrl && (
            <p>
              <a href={flowRun.recordingUrl} target="_blank" rel="noreferrer">
                Recording
              </a>
            </p>
          )}
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
