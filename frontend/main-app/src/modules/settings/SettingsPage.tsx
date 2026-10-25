import { Navigate, useSearchParams } from "react-router-dom";
import { Activity, BadgeDollarSign, Building2, MapPin, Settings as SettingsIcon } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PageHeader from "../../components/PageHeader";
import CompanyTab from "./tabs/CompanyTab";
import GeneralTab from "./tabs/GeneralTab";
import AdsTab from "./tabs/AdsTab";
import StatusTab from "./tabs/StatusTab";
import LocationsTab from "./tabs/LocationsTab";

const TABS = [
  { id: "company", label: "Company Profile", icon: Building2, Component: CompanyTab },
  { id: "general", label: "Notifications", icon: SettingsIcon, Component: GeneralTab },
  { id: "locations", label: "Cities & Districts", icon: MapPin, Component: LocationsTab },
  { id: "ads", label: "Ad Accounts", icon: BadgeDollarSign, Component: AdsTab },
  { id: "status", label: "Platform Status", icon: Activity, Component: StatusTab },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  if (searchParams.get("tab") === "push") return <Navigate to="/push" replace />;   // push now lives on its own page
  // Social connections moved to the Social page (Accounts tab).
  if (searchParams.get("tab") === "social") return <Navigate to="/social?tab=accounts" replace />;
  const activeId = (searchParams.get("tab") as TabId) || "company";
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0];
  const ActiveComponent = active.Component;

  function selectTab(id: TabId) {
    setSearchParams(id === "company" ? {} : { tab: id });
  }

  return (
    <AppLayout>
      <PageHeader title="Settings" description="Company profile, notifications and connected accounts." />

      <div className="flex gap-1 border-b border-surface-200 mb-6 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-brand-500 text-brand-700"
                  : "border-transparent text-surface-500 hover:text-surface-800"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      <ActiveComponent />
    </AppLayout>
  );
}
