"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { FlowConfig } from "@/lib/types";

type FormState = {
  flowType: string;
  nlpearlOutboundId: string;
  preliminarySmsTemplate: string;
  consentSmsTemplate: string;
  delayMinutes: number;
  sendSchedule: string;
  sendTimezone: string;
  maxRetryAttempts: number;
  retryDelayMinutes: string;
  retryMinCallDurationSeconds: string;
  retryOnCallStatuses: string;
  retryOnConversationStatuses: string;
  enabled: boolean;
};

const emptyForm: FormState = {
  flowType: "",
  nlpearlOutboundId: "",
  preliminarySmsTemplate: "",
  consentSmsTemplate: "",
  delayMinutes: 10,
  sendSchedule: "",
  sendTimezone: "Asia/Jerusalem",
  maxRetryAttempts: 0,
  retryDelayMinutes: "",
  retryMinCallDurationSeconds: "",
  retryOnCallStatuses: "",
  retryOnConversationStatuses: "",
  enabled: true,
};

export default function FlowConfigPage() {
  const [configs, setConfigs] = useState<FlowConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // flowType being edited, or "new"
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = () => {
    api
      .get<FlowConfig[]>("/flow-configs")
      .then(setConfigs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load configs"));
  };

  useEffect(load, []);

  const startEdit = (config?: FlowConfig) => {
    setError(null);
    if (config) {
      setEditing(config.flowType);
      setForm({
        ...config,
        sendSchedule: config.sendSchedule ?? "",
        retryDelayMinutes: config.retryDelayMinutes?.toString() ?? "",
        retryMinCallDurationSeconds: config.retryMinCallDurationSeconds?.toString() ?? "",
        retryOnCallStatuses: config.retryOnCallStatuses ?? "",
        retryOnConversationStatuses: config.retryOnConversationStatuses ?? "",
      });
    } else {
      setEditing("new");
      setForm(emptyForm);
    }
  };

  const save = async () => {
    try {
      const payload = {
        ...form,
        retryDelayMinutes: form.retryDelayMinutes === "" ? undefined : Number(form.retryDelayMinutes),
        retryMinCallDurationSeconds:
          form.retryMinCallDurationSeconds === "" ? undefined : Number(form.retryMinCallDurationSeconds),
      };
      if (editing === "new") {
        await api.post("/flow-configs", payload);
      } else if (editing) {
        const { flowType, ...rest } = payload;
        await api.patch(`/flow-configs/${editing}`, rest);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save config");
    }
  };

  const remove = async (flowType: string) => {
    if (!confirm(`Delete flow config "${flowType}"?`)) return;
    try {
      await api.delete(`/flow-configs/${flowType}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete config");
    }
  };

  return (
    <div>
      <h1>Flow Config</h1>
      {error && <div className="error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Flow Type</th>
            <th>NLPearl Outbound ID</th>
            <th>Delay (min)</th>
            <th>Send Schedule</th>
            <th>Max Retries</th>
            <th>Enabled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.flowType}>
              <td>{c.flowType}</td>
              <td>{c.nlpearlOutboundId}</td>
              <td>{c.delayMinutes}</td>
              <td>{c.sendSchedule ?? "Immediately"}</td>
              <td>{c.maxRetryAttempts}</td>
              <td>{c.enabled ? "Yes" : "No"}</td>
              <td className="actions">
                <button onClick={() => startEdit(c)}>Edit</button>
                <button onClick={() => remove(c.flowType)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        <button className="primary" onClick={() => startEdit()}>
          + New flow config
        </button>
      </p>

      {editing && (
        <div className="card">
          <h3>{editing === "new" ? "New flow config" : `Edit "${editing}"`}</h3>

          <div className="form-row">
            <label>Flow type</label>
            <input
              value={form.flowType}
              disabled={editing !== "new"}
              onChange={(e) => setForm({ ...form, flowType: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>NLPearl outbound ID</label>
            <input
              value={form.nlpearlOutboundId}
              onChange={(e) => setForm({ ...form, nlpearlOutboundId: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Preliminary SMS template (supports {"{{name}}"}, {"{{cfaUrl}}"}, etc.)</label>
            <textarea
              rows={3}
              value={form.preliminarySmsTemplate}
              onChange={(e) => setForm({ ...form, preliminarySmsTemplate: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Consent SMS template</label>
            <textarea
              rows={3}
              value={form.consentSmsTemplate}
              onChange={(e) => setForm({ ...form, consentSmsTemplate: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Delay before call (minutes)</label>
            <input
              type="number"
              min={0}
              value={form.delayMinutes}
              onChange={(e) => setForm({ ...form, delayMinutes: Number(e.target.value) })}
            />
          </div>

          <div className="form-row">
            <label>
              Send schedule (cron expression, optional — leave blank to send immediately on
              ingest)
            </label>
            <input
              placeholder="e.g. 0 10,15 * * 0-4 (10am & 3pm, Sun–Thu)"
              value={form.sendSchedule}
              onChange={(e) => setForm({ ...form, sendSchedule: e.target.value })}
            />
          </div>

          {form.sendSchedule && (
            <div className="form-row">
              <label>Timezone for the schedule above</label>
              <input
                value={form.sendTimezone}
                onChange={(e) => setForm({ ...form, sendTimezone: e.target.value })}
              />
            </div>
          )}

          <div className="form-row">
            <label>Max retry attempts (0 disables auto-retry for this flow)</label>
            <input
              type="number"
              min={0}
              value={form.maxRetryAttempts}
              onChange={(e) => setForm({ ...form, maxRetryAttempts: Number(e.target.value) })}
            />
          </div>

          {form.maxRetryAttempts > 0 && (
            <>
              <div className="form-row">
                <label>Retry delay in minutes (blank = reuse the delay above)</label>
                <input
                  type="number"
                  min={0}
                  placeholder={String(form.delayMinutes)}
                  value={form.retryDelayMinutes}
                  onChange={(e) => setForm({ ...form, retryDelayMinutes: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>Retry if the call connected but ended faster than (seconds, optional)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 10"
                  value={form.retryMinCallDurationSeconds}
                  onChange={(e) => setForm({ ...form, retryMinCallDurationSeconds: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>
                  Retry on these NLPearl call-status codes (comma-separated). Reference:
                  3=InProgress, 4=Completed, 5=Busy, 6=Failed, 7=NoAnswer, 8=Canceled.
                </label>
                <input
                  placeholder="e.g. 5,6,7,8"
                  value={form.retryOnCallStatuses}
                  onChange={(e) => setForm({ ...form, retryOnCallStatuses: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>
                  Retry on these NLPearl conversation-status codes (comma-separated). Reference:
                  10=NotAnswered, 100=Success, 110=NotSuccessful, 150=Unreachable, 300=QueueAbandon.
                </label>
                <input
                  placeholder="e.g. 110,150,300"
                  value={form.retryOnConversationStatuses}
                  onChange={(e) => setForm({ ...form, retryOnConversationStatuses: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="form-row">
            <label>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />{" "}
              Enabled
            </label>
          </div>

          <div className="actions">
            <button className="primary" onClick={save}>
              Save
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
