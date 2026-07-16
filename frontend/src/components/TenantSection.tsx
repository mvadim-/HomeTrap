import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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
import { formatDate } from "../utils/format";

function localToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function emptyTenant(contractStart = localToday()): TenantPayload {
  return {
    full_name: "",
    phone: "",
    email: "",
    contract_start: contractStart,
    contract_end: null,
    notes: "",
  };
}

function nextDay(value: string): string {
  const day = new Date(`${value}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

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
    if (error.message.includes("overlaps")) {
      return "Дати контракту перетинаються з уже збереженою історією орендарів.";
    }
    return "У квартирі вже є активний орендар. Оновіть список і завершіть його контракт перед додаванням нового.";
  }
  return error instanceof ApiError ? error.message : fallback;
}

export type OccupancyState =
  | { status: "unknown" }
  | { status: "vacant" }
  | { status: "occupied"; contractStart: string };

interface TenantSectionProps {
  apartmentId: number;
  onOccupancyChange?: (occupancy: OccupancyState) => void;
}

export function TenantSection({ apartmentId, onOccupancyChange }: TenantSectionProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [attachments, setAttachments] = useState<TenantAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantOccupancyKnown, setTenantOccupancyKnown] = useState(false);
  const [error, setError] = useState("");
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TenantPayload>(() => emptyTenant());
  const [showEndForm, setShowEndForm] = useState(false);
  const [contractEnd, setContractEnd] = useState(localToday);
  const [files, setFiles] = useState<File[]>([]);
  const loadRequestId = useRef(0);
  const apartmentScope = useRef({ apartmentId: 0, generation: 0 });
  const mounted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function isCurrentApartment(targetApartmentId: number, generation: number): boolean {
    return mounted.current
      && apartmentScope.current.apartmentId === targetApartmentId
      && apartmentScope.current.generation === generation;
  }

  const load = useCallback(async (targetApartmentId: number, generation: number, manageLoading = false) => {
    if (!isCurrentApartment(targetApartmentId, generation)) return;
    const requestId = ++loadRequestId.current;
    const isCurrentRequest = () => (
      isCurrentApartment(targetApartmentId, generation) && requestId === loadRequestId.current
    );
    if (manageLoading) {
      setLoading(true);
      setTenantOccupancyKnown(false);
      setError("");
      setTenants([]);
      setAttachments([]);
      onOccupancyChange?.({ status: "unknown" });
    }
    try {
      let tenantItems: Tenant[];
      try {
        tenantItems = await getTenants(targetApartmentId);
      } catch (requestError) {
        if (!isCurrentRequest()) return;
        if (!manageLoading) throw requestError;
        setTenants([]);
        setAttachments([]);
        setTenantOccupancyKnown(false);
        onOccupancyChange?.({ status: "unknown" });
        setError(readableError(requestError, "Не вдалося завантажити орендарів."));
        return;
      }
      if (!isCurrentRequest()) return;
      const active = tenantItems.find((tenant) => tenant.contract_end === null);
      let activeAttachments: TenantAttachment[];
      try {
        activeAttachments = active ? await getTenantAttachments(active.id) : [];
      } catch (requestError) {
        if (!isCurrentRequest()) return;
        setTenants(tenantItems);
        setAttachments([]);
        setTenantOccupancyKnown(true);
        onOccupancyChange?.(active
          ? { status: "occupied", contractStart: active.contract_start }
          : { status: "vacant" });
        if (!manageLoading) throw requestError;
        setError(readableError(requestError, "Не вдалося завантажити файли орендаря."));
        return;
      }
      if (!isCurrentRequest()) return;
      setTenants(tenantItems);
      setAttachments(activeAttachments);
      setTenantOccupancyKnown(true);
      onOccupancyChange?.(active
        ? { status: "occupied", contractStart: active.contract_start }
        : { status: "vacant" });
    } finally {
      if (manageLoading && isCurrentRequest()) setLoading(false);
    }
  }, [onOccupancyChange]);

  useEffect(() => {
    const generation = apartmentScope.current.generation + 1;
    apartmentScope.current = { apartmentId, generation };
    mounted.current = true;
    setShowTenantForm(false);
    setEditingTenantId(null);
    setDraft(emptyTenant());
    setShowEndForm(false);
    setContractEnd(localToday());
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void load(apartmentId, generation, true);
    return () => {
      if (apartmentScope.current.generation === generation) {
        mounted.current = false;
        loadRequestId.current += 1;
      }
    };
  }, [apartmentId, load]);

  const activeTenant = tenants.find((tenant) => tenant.contract_end === null);
  const formerTenants = tenants.filter((tenant) => tenant.contract_end !== null);

  async function refreshAfterMutation(targetApartmentId: number, generation: number) {
    try {
      await load(targetApartmentId, generation);
    } catch {
      if (isCurrentApartment(targetApartmentId, generation)) {
        setError("Зміну збережено, але не вдалося оновити дані. Оновіть сторінку, щоб побачити актуальний стан.");
      }
    }
  }

  function beginCreate() {
    setEditingTenantId(null);
    setDraft(emptyTenant());
    setShowTenantForm(true);
    setError("");
  }

  function toggleEndForm() {
    setShowEndForm((shown) => {
      if (!shown) setContractEnd(localToday());
      return !shown;
    });
  }

  function beginEdit(tenant: Tenant) {
    setEditingTenantId(tenant.id);
    setDraft(tenantPayload(tenant));
    setShowTenantForm(true);
    setError("");
  }

  async function submitTenant(event: FormEvent) {
    event.preventDefault();
    const mutationGeneration = apartmentScope.current.generation;
    setError("");
    try {
      if (editingTenantId) {
        await updateTenant(editingTenantId, normalizedPayload(draft));
      } else {
        await createTenant(apartmentId, normalizedPayload(draft));
      }
      if (!isCurrentApartment(apartmentId, mutationGeneration)) return;
      setShowTenantForm(false);
      setEditingTenantId(null);
      await refreshAfterMutation(apartmentId, mutationGeneration);
    } catch (requestError) {
      if (isCurrentApartment(apartmentId, mutationGeneration)) {
        setError(readableError(requestError, "Не вдалося зберегти орендаря."));
      }
    }
  }

  async function submitContractEnd(event: FormEvent) {
    event.preventDefault();
    if (!activeTenant || !window.confirm(`Завершити контракт орендаря ${activeTenant.full_name} ${contractEnd}?`)) return;
    const mutationGeneration = apartmentScope.current.generation;
    setError("");
    try {
      await endTenantContract(activeTenant.id, contractEnd);
      if (!isCurrentApartment(apartmentId, mutationGeneration)) return;
      setShowEndForm(false);
      setShowTenantForm(true);
      setEditingTenantId(null);
      setDraft(emptyTenant(nextDay(contractEnd)));
      await refreshAfterMutation(apartmentId, mutationGeneration);
    } catch (requestError) {
      if (isCurrentApartment(apartmentId, mutationGeneration)) {
        setError(readableError(requestError, "Не вдалося завершити контракт."));
      }
    }
  }

  async function submitAttachments(event: FormEvent) {
    event.preventDefault();
    if (!activeTenant || files.length === 0) return;
    const mutationGeneration = apartmentScope.current.generation;
    setError("");
    try {
      await uploadTenantAttachments(activeTenant.id, files);
      if (!isCurrentApartment(apartmentId, mutationGeneration)) return;
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshAfterMutation(apartmentId, mutationGeneration);
    } catch (requestError) {
      if (isCurrentApartment(apartmentId, mutationGeneration)) {
        setError(readableError(requestError, "Не вдалося завантажити файли."));
      }
    }
  }

  async function removeAttachment(attachment: TenantAttachment) {
    if (!window.confirm(`Видалити файл «${attachment.original_name}»?`)) return;
    const mutationGeneration = apartmentScope.current.generation;
    setError("");
    try {
      await deleteTenantAttachment(attachment.id);
      if (!isCurrentApartment(apartmentId, mutationGeneration)) return;
      await refreshAfterMutation(apartmentId, mutationGeneration);
    } catch (requestError) {
      if (isCurrentApartment(apartmentId, mutationGeneration)) {
        setError(readableError(requestError, "Не вдалося видалити файл."));
      }
    }
  }

  return (
    <section className="section-card tenant-section">
      <div className="section-heading">
        <div><h2>Орендар</h2><p>Контакти, контракт і прикріплені файли</p></div>
        {tenantOccupancyKnown && !activeTenant && !showTenantForm && (
          <button className="button" type="button" onClick={beginCreate}>Новий орендар</button>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}
      {loading && <p className="muted-text">Завантажуємо орендарів…</p>}

      {!loading && activeTenant && (
        <div className="tenant-card">
          <div className="tenant-card-heading">
            <div><strong>{activeTenant.full_name}</strong><span>контракт з {formatDate(activeTenant.contract_start)}</span></div>
            <button className="table-action" type="button" onClick={() => beginEdit(activeTenant)}>Редагувати</button>
          </div>
          <dl className="details-list tenant-details">
            <dt>Телефон</dt><dd>{activeTenant.phone ? <a className="tenant-contact-link" href={`tel:${activeTenant.phone}`}>{activeTenant.phone}</a> : "—"}</dd>
            <dt>Email</dt><dd>{activeTenant.email ? <a className="tenant-contact-link" href={`mailto:${activeTenant.email}`}>{activeTenant.email}</a> : "—"}</dd>
            <dt>Примітки</dt><dd>{activeTenant.notes || "—"}</dd>
          </dl>

          <div className="tenant-actions">
            <button className="secondary-button" type="button" onClick={toggleEndForm}>Завершити контракт</button>
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
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a href={getAttachmentUrl(attachment.id)} target="_blank" rel="noreferrer">{attachment.original_name}</a>
                  <button className="table-action" type="button" onClick={() => removeAttachment(attachment)}>Видалити</button>
                </li>
              ))}
            </ul>
            {attachments.length === 0 && <p className="muted-text">Файлів ще немає.</p>}
            <form className="attachment-form" onSubmit={submitAttachments}>
              <label className="secondary-button attachment-picker">Додати файли
                <input ref={fileInputRef} className="file-input" aria-label="Файли контракту" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple type="file" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
              </label>
              <button className="button" disabled={files.length === 0} type="submit">Завантажити</button>
            </form>
            {files.length > 0 && <ul className="selected-files" aria-label="Вибрані файли">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
          </div>
        </div>
      )}

      {!loading && tenantOccupancyKnown && !activeTenant && !showTenantForm && <p className="muted-text">Активного орендаря немає.</p>}

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
          <ul>{formerTenants.map((tenant) => <li key={tenant.id}><strong>{tenant.full_name}</strong><span>{formatDate(tenant.contract_start)} — {formatDate(tenant.contract_end!)}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
