import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Settings } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { fetchOrganizationProfile } from "../../lib/organization";
import { fetchTaskCounts, fetchTeam, type TeamMember } from "../../lib/crm";
import PipelineTab from "./PipelineTab";
import TasksTab from "./TasksTab";
import DuesTab from "./DuesTab";
import TeamActivityTab from "./TeamActivityTab";
import ReportsTab from "./ReportsTab";
import CrmCustomize from "./CrmSettingsPage";

type Tab = "pipeline" | "tasks" | "baki" | "reports" | "team" | "customize";

export default function CrmPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "pipeline";
  const setTab = (t: Tab) => setParams(t === "pipeline" ? {} : { tab: t }, { replace: true });

  const [role, setRole] = useState<string>("member");
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [counts, setCounts] = useState({ overdue: 0, today: 0, upcoming: 0 });
  const reloadKey = 0;

  const myId = team.find((t) => t.email === myEmail)?.user_id ?? null;
  const isSales = role === "sales";
  const canManage = role === "owner" || role === "admin";

  const refreshStats = useCallback(() => {
    fetchTaskCounts(false).then(setCounts).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchOrganizationProfile().then((p) => { setRole(p.my_role); setMyEmail(p.my_email); }).catch(() => undefined);
    fetchTeam().then(setTeam).catch(() => undefined);
    refreshStats();
  }, [refreshStats]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "pipeline", label: "Pipeline" },
    { key: "tasks", label: "Follow-ups", badge: counts.today },
    { key: "baki", label: "Dues" },
    { key: "reports", label: "Reports" },
    { key: "team", label: canManage ? "Team" : "My work" },
    { key: "customize", label: "Customize" },
  ];

  return (
    <AppLayout>
      <div className="flex items-center gap-2 sm:gap-4 border-b border-surface-200 mb-3">
        <h1 className="text-lg font-bold text-surface-900 tracking-tight hidden sm:block">CRM</h1>
        {/* the four tabs always fit — no sideways scrolling */}
        <div className="flex flex-1 min-w-0" role="tablist">
          {tabs.filter((t) => t.key !== "customize" || canManage).map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} aria-label={t.key === "customize" ? "Customize your CRM" : undefined} onClick={() => setTab(t.key)}
              className={`flex-1 sm:flex-none px-1.5 sm:px-4 py-2.5 text-[13px] sm:text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-surface-600 hover:text-surface-900"}`}>
              {t.key === "customize" ? <span className="inline-flex items-center justify-center gap-1.5"><Settings size={15} /><span className="hidden sm:inline">{t.label}</span></span> : t.label}
              {!!t.badge && <span className="ml-1 text-[11px] bg-danger-base text-white rounded-full px-1.5 py-px">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "pipeline" && <PipelineTab team={team} isSales={isSales} canManage={canManage} reloadKey={reloadKey} onChanged={refreshStats} />}
      {tab === "tasks" && <TasksTab isSales={isSales} team={team} myId={myId} onChanged={refreshStats} />}
      {tab === "baki" && <DuesTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "team" && <TeamActivityTab canManage={canManage} />}
      {tab === "customize" && canManage && <CrmCustomize />}

    </AppLayout>
  );
}
