"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { FlowRunListResponse, FlowRunStatus } from "@/lib/types";

export default function FlowRunsPage() {
  const [flowType, setFlowType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FlowRunListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (flowType) params.set("flowType", flowType);
    if (status) params.set("status", status);
    if (search) params.set("search", search);

    setLoading(true);
    setError(null);
    api
      .get<FlowRunListResponse>(`/flow-runs?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load records"))
      .finally(() => setLoading(false));
  }, [flowType, status, search, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <h1>Flow Runs</h1>

      <div className="filters">
        <input
          placeholder="Filter by flow type"
          value={flowType}
          onChange={(e) => {
            setPage(1);
            setFlowType(e.target.value);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {Object.values(FlowRunStatus).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          placeholder="Search name, phone, or mpl"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading && !error && data && (
        <>
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Flow</th>
                <th>Name</th>
                <th>Phone</th>
                <th>MPL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((run) => (
                <tr key={run.id}>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                  <td>{run.flowType}</td>
                  <td>
                    <Link href={`/flow-runs/${run.id}`}>{run.name}</Link>
                  </td>
                  <td>{run.phone}</td>
                  <td>{run.mpl}</td>
                  <td>
                    <span className={`badge ${run.status}`}>{run.status}</span>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6}>No records match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {data.page} of {totalPages} ({data.total} total)
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
