import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Archive, History } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import { fetchTrashedCampaigns, restoreCampaign, type Campaign } from "../../lib/campaigns";
import CampaignHistoryModal from "./CampaignHistoryModal";

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CampaignTrashPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<Campaign | null>(null);

  useEffect(() => { fetchTrashedCampaigns().then(setCampaigns).catch(() => setError("Failed to load trash")); }, []);

  async function handleRestore(c: Campaign) {
    setBusyId(c.id);
    try {
      await restoreCampaign(c.id);
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore campaign");
    } finally { setBusyId(null); }
  }

  return (
    <AppLayout>
      <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium mb-4">
        <ArrowLeft size={14} /> Back to Email Campaigns
      </Link>
      <PageHeader title="Deleted Campaigns" description={`${campaigns.length} campaign(s) in trash. Restore one to bring it back with its full history.`} />
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

      {campaigns.length === 0 ? (
        <Card><EmptyState icon={<Archive size={44} />} title="Trash is empty" description="Campaigns you delete will appear here and can be restored any time." /></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-surface-800 truncate">{c.name}</span>
                  <Badge size="sm">{c.status}</Badge>
                </div>
                <p className="text-xs text-surface-600 truncate">{c.subject}</p>
                <p className="text-xs text-surface-500 mt-1">Deleted {c.deleted_at ? formatDate(c.deleted_at) : ""}</p>
              </div>
              <div className="flex gap-2">
                <Button size="xs" variant="ghost" icon={<History size={12} />} onClick={() => setHistoryFor(c)}>History</Button>
                <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} loading={busyId === c.id} onClick={() => handleRestore(c)}>Restore</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {historyFor && (
        <CampaignHistoryModal campaignId={historyFor.id} campaignLabel={historyFor.name} canRestore={false}
          onClose={() => setHistoryFor(null)} onRestored={() => {}} />
      )}
    </AppLayout>
  );
}
