import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import SmsGatewayPage from "./sms-gateway/SmsGatewayPage";
import WhatsAppPanelPage from "./whatsapp/WhatsAppPanelPage";
import IntegrationDetailPage from "./integrations/IntegrationDetailPage";
import IntegrationHubPage from "./integrations/IntegrationHubPage";
import PlansPage from "./plans/PlansPage";
import ServicesPage from "./services/ServicesPage";
import ManualPaymentsPage from "./payments/ManualPaymentsPage";
import RevenuePage from "./revenue/RevenuePage";
import TenantCreatePage from "./tenants/TenantCreatePage";
import TenantDetailPage from "./tenants/TenantDetailPage";
import TenantListPage from "./tenants/TenantListPage";
import WalletsPage from "./wallets/WalletsPage";
import EmailBrandingPage from "./settings/EmailBrandingPage";
import CompanySettingsPage from "./settings/CompanySettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tenants" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/tenants" element={<TenantListPage />} />
      <Route path="/tenants/new" element={<TenantCreatePage />} />
      <Route path="/tenants/:orgId" element={<TenantDetailPage />} />
      <Route path="/plans" element={<PlansPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/manual-payments" element={<ManualPaymentsPage />} />
      <Route path="/wallets" element={<WalletsPage />} />
      <Route path="/revenue" element={<RevenuePage />} />
      <Route path="/verifications" element={<Navigate to="/integrations/sms?tab=requests" replace />} />
      <Route path="/integrations/sms" element={<SmsGatewayPage />} />
      <Route path="/integrations/whatsapp" element={<WhatsAppPanelPage />} />
      <Route path="/sms-gateway" element={<Navigate to="/integrations/sms" replace />} />
      <Route path="/integrations" element={<IntegrationHubPage />} />
      <Route path="/integrations/:code" element={<IntegrationDetailPage />} />
      <Route path="/company-settings" element={<CompanySettingsPage />} />
      <Route path="/email-branding" element={<EmailBrandingPage />} />
    </Routes>
  );
}
