import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, MapPin, Plus, Trash2, UserCheck, UserPlus, Users, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Spinner from "../../components/Spinner";
import {
  type EventRegistration,
  type MarketingEvent,
  createEvent,
  deleteEvent,
  listEvents,
  listRegistrations,
  markAttended,
  registerContact,
} from "../../lib/events";
import { getAccessToken } from "../../lib/auth";
import { confirmText } from "../../components/ConfirmDialog";

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Workflow {
  id: string;
  name: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPast(iso: string) {
  return new Date(iso) < new Date();
}

// ── Create Event Modal ──────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (ev: MarketingEvent) => void;
  workflows: Workflow[];
}

function CreateModal({ onClose, onCreated, workflows }: CreateModalProps) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    event_date: "",
    location: "",
    capacity: "",
    workflow_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.event_date) {
      setError("Title and event date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ev = await createEvent({
        title: form.title.trim(),
        description: form.description || undefined,
        event_date: new Date(form.event_date).toISOString(),
        location: form.location || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        workflow_id: form.workflow_id || null,
      });
      onCreated(ev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create event.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">New Event</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Event Title *"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Dhaka Webinar 2026"
          />
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
            <textarea
              className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this event about?"
            />
          </div>
          <Input
            label="Event Date & Time *"
            type="datetime-local"
            value={form.event_date}
            onChange={(e) => set("event_date", e.target.value)}
          />
          <Input
            label="Location / URL"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="https://meet.google.com/..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Capacity (optional)"
              type="number"
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              placeholder="Unlimited"
            />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Reminder Workflow</label>
              <select
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.workflow_id}
                onChange={(e) => set("workflow_id", e.target.value)}
              >
                <option value="">None</option>
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-100">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Create Event
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Register Contact Modal ──────────────────────────────────────────────────

interface RegisterModalProps {
  eventId: string;
  onClose: () => void;
  onRegistered: (reg: EventRegistration) => void;
  contacts: Contact[];
}

function RegisterModal({ eventId, onClose, onRegistered, contacts }: RegisterModalProps) {
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!contactId) { setError("Select a contact."); return; }
    setSaving(true);
    setError(null);
    try {
      const reg = await registerContact(eventId, contactId);
      onRegistered(reg);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">Register Contact</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Contact</label>
            <select
              className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">Select a contact…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email} — {c.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-100">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Register</Button>
        </div>
      </div>
    </div>
  );
}

// ── Event Row ────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: MarketingEvent;
  contacts: Contact[];
  onDelete: (id: string) => void;
}

function EventRow({ event, contacts, onDelete }: EventRowProps) {
  const [open, setOpen] = useState(false);
  const [regs, setRegs] = useState<EventRegistration[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);

  const loadRegs = async () => {
    if (open) { setOpen(false); return; }
    setLoadingRegs(true);
    setOpen(true);
    try {
      const data = await listRegistrations(event.id);
      setRegs(data);
    } finally {
      setLoadingRegs(false);
    }
  };

  const handleMarkAttended = async (reg: EventRegistration) => {
    if (reg.attended) return;
    setMarking(reg.id);
    try {
      const updated = await markAttended(event.id, reg.id);
      setRegs((prev) => prev.map((r) => (r.id === reg.id ? updated : r)));
    } finally {
      setMarking(null);
    }
  };

  const past = isPast(event.event_date);

  return (
    <>
      <div className="bg-white rounded-xl border border-surface-100 shadow-sm">
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-50 rounded-xl"
          onClick={loadRegs}
        >
          <div className="flex-shrink-0 text-brand-600">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <div className="flex-shrink-0 w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
            <CalendarDays size={18} className="text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-surface-900 truncate">{event.title}</p>
            <p className="text-xs text-surface-500 flex items-center gap-3 mt-0.5">
              <span>{fmtDate(event.event_date)}</span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {event.location.startsWith("http") ? "Online" : event.location}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-surface-900">{event.registration_count}</p>
              <p className="text-xs text-surface-500">registered</p>
            </div>
            <Badge variant={past ? "default" : "success"} size="sm">
              {past ? "Past" : "Upcoming"}
            </Badge>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
              className="text-surface-400 hover:text-danger-dark p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-surface-100 px-5 py-4">
            {event.description && (
              <p className="text-sm text-surface-600 mb-4">{event.description}</p>
            )}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-surface-700 flex items-center gap-2">
                <Users size={14} />
                Registrations
              </h4>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => { e.stopPropagation(); setShowRegModal(true); }}
              >
                <UserPlus size={13} className="mr-1" />
                Add
              </Button>
            </div>
            {loadingRegs ? (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            ) : regs.length === 0 ? (
              <p className="text-sm text-surface-500 text-center py-4">No registrations yet.</p>
            ) : (
              <div className="space-y-2">
                {regs.map((reg) => (
                  <div
                    key={reg.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-surface-800">
                        {reg.contact_name || reg.contact_email || "Unknown"}
                      </p>
                      {reg.contact_name && (
                        <p className="text-xs text-surface-500">{reg.contact_email}</p>
                      )}
                      <p className="text-xs text-surface-400 mt-0.5">
                        Registered {fmtDate(reg.registered_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {reg.attended ? (
                        <Badge variant="success" size="sm">
                          <UserCheck size={11} className="mr-1" />
                          Attended
                        </Badge>
                      ) : (
                        <button
                          disabled={!!marking}
                          onClick={() => handleMarkAttended(reg)}
                          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                        >
                          {marking === reg.id ? <Spinner size="xs" /> : "Mark attended"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showRegModal && (
        <RegisterModal
          eventId={event.id}
          contacts={contacts}
          onClose={() => setShowRegModal(false)}
          onRegistered={(reg) => {
            setRegs((prev) => [...prev, reg]);
            setShowRegModal(false);
          }}
        />
      )}
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<MarketingEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const authHeaders = {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [evs, cRes, wRes] = await Promise.all([
          listEvents(),
          fetch("/api/v1/contacts?limit=200", { headers: authHeaders }),
          fetch("/api/v1/workflows", { headers: authHeaders }),
        ]);
        setEvents(evs);
        setContacts(cRes.ok ? await cRes.json() : []);
        setWorkflows(wRes.ok ? await wRes.json() : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load events.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!(await confirmText("Delete this event and all its registrations?"))) return;
    try {
      await deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Event Marketing"
          description="Webinars and events with automated reminder sequences."
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} className="mr-1.5" />
              New Event
            </Button>
          }
        />

        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays size={40} className="mx-auto text-surface-300 mb-3" />
            <p className="text-surface-500 font-medium">No events yet</p>
            <p className="text-sm text-surface-400 mt-1">Create your first webinar or event.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <EventRow
                key={ev.id}
                event={ev}
                contacts={contacts}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          workflows={workflows}
          onClose={() => setShowCreate(false)}
          onCreated={(ev) => {
            setEvents((prev) => [...prev, ev].sort(
              (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
            ));
            setShowCreate(false);
          }}
        />
      )}
    </AppLayout>
  );
}
