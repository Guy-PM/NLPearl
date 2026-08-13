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
  enabled: boolean;
};

const emptyForm: FormState = {
  flowType: "",
  nlpearlOutboundId: "",
  preliminarySmsTemplate: "",
  consentSmsTemplate: "",
  delayMinutes: 10,
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
      setForm({ ...config });
    } else {
      setEditing("new");
      setForm(emptyForm);
    }
  };

  const save = async () => {
    try {
      if (editing === "new") {
        await api.post("/flow-configs", form);
      } else if (editing) {
        const { flowType, ...rest } = form;
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
