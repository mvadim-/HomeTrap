import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  ApiError,
  Tenant,
  TenantAttachment,
  TenantPayload,
  createTenant,
  deleteTenantAttachment,
  endTenantContract,
  getAttachmentUrl,
  getTenantAttachments,
  getTenants,
  updateTenant,
  uploadTenantAttachments,
} from "../api/client";

const today = new Date().toISOString().slice(0, 10);

const emptyTenant: TenantPayload = {
  full_name: "",
  phone: "",
  email: "",
  contract_start: today,
  contract_end: null,
  notes: "",
};

function tenantPayload(tenant: Tenant): TenantPayload {
  return {
    full_name: tenant.full_name,
    phone: tenant.phone ?? "",
    email: tenant.email ?? "",
    contract_start: tenant.contract_start,
    contract_end: tenant.contract_end,
    notes: tenant.notes ?? "",
  };
}

function normalizedPayload(payload: TenantPayload): TenantPayload {
  return {
    ...payload,
    phone: payload.phone || null,
    email: payload.email || null,
    notes: payload.notes || null,
  };
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 409) {
    return "У квартирі вже є активний орендар. Оновіть список і завершіть його контракт перед додаванням нового.";
  }
  return error instanceof ApiError ? error.message : fallback;
}

interface TenantSectionProps {
  apartmentId: number;
}

export function TenantSection({ apartmentId }: TenantSectionProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [attachments, setAttachments] = useState<Record<number, TenantAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TenantPayload>(emptyTenant);
  const [showEndForm, setShowEndForm] = useState(false);
  const [contractEnd, setContractEnd] = useState(today);
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    const tenantItems = await getTenants(apartmentId);
    const attachmentEntries = await Promise.all(
      tenantItems.map(async (tenant) => [tenant.id, await getTenantAttachments(tenant.id)] as const),
    );
    setTenants(tenantItems);
    setAttachments(Object.fromEntries(attachmentEntries));
  }, [apartmentId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((requestError) => setError(readableError(requestError, "Не вдалося завантажити орендарів.")))
      .finally(() => setLoading(false));
  }, [load]);

  const activeTenant = tenants.find((tenant) => tenant.contract_end === null);
  const formerTenants = tenants.filter((tenant) => tenant.contract_end !== null);

  function beginCreate() {
    setEditingTenantId(null);
    setDraft({ ...emptyTenant });
    setShowTenantForm(true);
    setError("");
  }

  function beginEdit(tenant: Tenant) {
    setEditingTenantId(tenant.id);
    setDraft(tenantPayload(tenant));
    setShowTenantForm(true);
    setError("");
  }

  async function submitTenant(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editingTenantId) {
        await updateTenant(editingTenantId, normalizedPayload(draft));
      } else {
        await createTenant(apartmentId, normalizedPayload(draft));
      }
      setShowTenantForm(false);
      setEditingTenantId(null);
      await load();
    } catch (requestError) {
      setError(readableError(requestError, "Не вдалося зберегти орендаря."));
    }
  }

  async function submitContractEnd(event: FormEvent) {
    event.preventDefault();
    if (!activeTenant || !window.confirm(`Завершити контракт орендаря ${activeTenant.full_name} ${contractEnd}?`)) return;
    setError("");
    try {
      await endTenantContract(activeTenant.id, contractEnd);
      setShowEndForm(false);
      setShowTenantForm(true);
      setEditingTenantId(null);
      setDraft({ ...emptyTenant, contract_start: contractEnd });
      await load();
    } catch (requestError) {
      setError(readableError(requestError, "Не вдалося завершити контракт."));
    }
  }

  async function submitAttachments(event: FormEvent) {
    event.preventDefault();
    if (!activeTenant || files.length === 0) return;
    setError("");
    try {
      await uploadTenantAttachments(activeTenant.id, files);
      setFiles([]);
      await load();
    } catch (requestError) {
      setError(readableError(requestError, "Не вдалося завантажити файли."));
    }
  }

  async function removeAttachment(attachment: TenantAttachment) {
    if (!window.confirm(`Видалити файл «${attachment.original_name}»?`)) return;
    setError("");
    try {
      await deleteTenantAttachment(attachment.id);
      await load();
    } catch (requestError) {
      setError(readableError(requestError, "Не вдалося видалити файл."));
    }
  }

  return (
    <section className="section-card tenant-section">
      <div className="section-heading">
        <div><h2>Орендар</h2><p>Контакти, контракт і прикріплені файли</p></div>
        {!activeTenant && !showTenantForm && (
          <button className="button" type="button" onClick={beginCreate}>Новий орендар</button>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}
      {loading && <p className="muted-text">Завантажуємо орендарів…</p>}

      {!loading && activeTenant && (
        <div className="tenant-card">
          <div className="tenant-card-heading">
            <div><strong>{activeTenant.full_name}</strong><span>контракт з {activeTenant.contract_start}</span></div>
            <button className="table-action" type="button" onClick={() => beginEdit(activeTenant)}>Редагувати</button>
          </div>
          <dl className="details-list tenant-details">
            <dt>Телефон</dt><dd>{activeTenant.phone ? <a href={`tel:${activeTenant.phone}`}>{activeTenant.phone}</a> : "—"}</dd>
            <dt>Email</dt><dd>{activeTenant.email ? <a href={`mailto:${activeTenant.email}`}>{activeTenant.email}</a> : "—"}</dd>
            <dt>Примітки</dt><dd>{activeTenant.notes || "—"}</dd>
          </dl>

          <div className="tenant-actions">
            <button className="secondary-button" type="button" onClick={() => setShowEndForm((shown) => !shown)}>Завершити контракт</button>
          </div>
          {showEndForm && (
            <form className="tenant-end-form" onSubmit={submitContractEnd}>
              <label>Дата завершення<input aria-label="Дата завершення контракту" required min={activeTenant.contract_start} type="date" value={contractEnd} onChange={(event) => setContractEnd(event.target.value)} /></label>
              <button className="button" type="submit">Підтвердити</button>
            </form>
          )}

          <div className="tenant-files">
            <h3>Файли контракту</h3>
            <ul>
              {(attachments[activeTenant.id] ?? []).map((attachment) => (
                <li key={attachment.id}>
                  <a href={getAttachmentUrl(attachment.id)} target="_blank" rel="noreferrer">{attachment.original_name}</a>
                  <button className="table-action" type="button" onClick={() => removeAttachment(attachment)}>Видалити</button>
                </li>
              ))}
            </ul>
            {(attachments[activeTenant.id] ?? []).length === 0 && <p className="muted-text">Файлів ще немає.</p>}
            <form className="attachment-form" onSubmit={submitAttachments}>
              <input aria-label="Файли контракту" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple type="file" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
              <button className="button" disabled={files.length === 0} type="submit">Завантажити</button>
            </form>
          </div>
        </div>
      )}

      {!loading && !activeTenant && !showTenantForm && <p className="muted-text">Активного орендаря немає.</p>}

      {showTenantForm && (!activeTenant || editingTenantId === activeTenant.id) && (
        <form className="inline-form tenant-form" onSubmit={submitTenant}>
          <label>ПІБ<input required value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
          <label>Телефон<input type="tel" value={draft.phone ?? ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
          <label>Email<input type="email" value={draft.email ?? ""} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
          <label>Контракт з<input required type="date" value={draft.contract_start} onChange={(event) => setDraft({ ...draft, contract_start: event.target.value })} /></label>
          <label className="tenant-notes">Примітки<textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          <div className="form-actions">
            <button className="button" type="submit">{editingTenantId ? "Зберегти" : "Додати орендаря"}</button>
            <button className="secondary-button" type="button" onClick={() => setShowTenantForm(false)}>Скасувати</button>
          </div>
        </form>
      )}

      {formerTenants.length > 0 && (
        <details className="tenant-history">
          <summary>Колишні орендарі ({formerTenants.length})</summary>
          <ul>{formerTenants.map((tenant) => <li key={tenant.id}><strong>{tenant.full_name}</strong><span>{tenant.contract_start} — {tenant.contract_end}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
