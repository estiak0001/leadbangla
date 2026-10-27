import { Navigate, Routes, Route } from "react-router-dom";
import LandingPage from "./modules/marketing/LandingPage";
import { AcceptableUsePage, PrivacyPage, TermsPage } from "./modules/marketing/LegalPages";
import SignupPage from "./modules/auth/SignupPage";
import LoginPage from "./modules/auth/LoginPage";
import VerifyEmailPage from "./modules/auth/VerifyEmailPage";
import ForgotPasswordPage from "./modules/auth/ForgotPasswordPage";
import ResetPasswordPage from "./modules/auth/ResetPasswordPage";
import AcceptInvitePage from "./modules/auth/AcceptInvitePage";
import PickPlanPage from "./modules/onboarding/PickPlanPage";
import ManualPaymentPage from "./modules/billing/ManualPaymentPage";
import CheckoutPage from "./modules/billing/CheckoutPage";
import FeatureOnly from "./components/FeatureOnly";
import { PATH_FEATURE } from "./lib/features";
import OnboardingPage from "./modules/onboarding/OnboardingPage";
import DashboardPage from "./modules/dashboard/DashboardPage";
import BillingPage from "./modules/billing/BillingPage";
import CheckoutSuccessPage from "./modules/billing/CheckoutSuccessPage";
import CheckoutCancelPage from "./modules/billing/CheckoutCancelPage";
import ImpersonateLandingPage from "./modules/admin/ImpersonateLandingPage";
import ContactFormPage from "./modules/audience/ContactFormPage";
import ContactsPage from "./modules/audience/ContactsPage";
import TrashPage from "./modules/audience/TrashPage";
import SegmentsPage from "./modules/audience/SegmentsPage";
import SegmentBuilderPage from "./modules/audience/SegmentBuilderPage";
import SegmentDetailPage from "./modules/audience/SegmentDetailPage";
import CampaignsPage from "./modules/email/CampaignsPage";
import EmailSetupPage from "./modules/email/EmailSetupPage";
import CampaignTrashPage from "./modules/email/CampaignTrashPage";
import CampaignEditorPage from "./modules/email/CampaignEditorPage";
import CampaignDetailPage from "./modules/email/CampaignDetailPage";
import AnalyticsPage from "./modules/analytics/AnalyticsPage";
import SocialPage from "./modules/social/SocialPage";
import ChannelPage from "./modules/messaging/ChannelPage";
import ComposePage from "./modules/messaging/ComposePage";
import MessagingCampaignDetailPage from "./modules/messaging/CampaignDetailPage";
import LandingPagesPage from "./modules/landing-pages/LandingPagesPage";
import LandingPageBuilder from "./modules/landing-pages/LandingPageBuilder";
import PublicLandingPage from "./modules/landing-pages/PublicLandingPage";
import WorkflowsPage from "./modules/workflows/WorkflowsPage";
import WorkflowBuilder from "./modules/workflows/WorkflowBuilder";
import CrmPage from "./modules/crm/CrmPage";
import ContactDetailPage from "./modules/crm/ContactDetailPage";
import SeoPage from "./modules/seo/SeoPage";
import AffiliatePage from "./modules/affiliate/AffiliatePage";
import InfluencersPage from "./modules/influencer/InfluencersPage";
import PushPage from "./modules/push/PushPage";
import SubscribePage from "./modules/push/SubscribePage";
import EventsPage from "./modules/events/EventsPage";
import PaidAdsPage from "./modules/paid-ads/PaidAdsPage";
import SuppressedPage from "./modules/email/SuppressedPage";
import MailPage from "./modules/mail/MailPage";
import SettingsPage from "./modules/settings/SettingsPage";
import ProfilePage from "./modules/settings/ProfilePage";
import TeamPage from "./modules/team/TeamPage";
import ChangePasswordPage from "./modules/auth/ChangePasswordPage";
import NotificationsPage from "./modules/notifications/NotificationsPage";
import Access from "./components/Access";
import { ROUTE_PERMISSION } from "./lib/permissions";
import type { ReactElement } from "react";

const PERM = (path: string) => [...ROUTE_PERMISSION].sort((a, b) => b[0].length - a[0].length).find(([p]) => path === p || path.startsWith(p + "/"))?.[1];

function Gate({ path, children }: { path: string; children: ReactElement }) {
  const perm = PERM(path);
  const base = Object.keys(PATH_FEATURE).find((k) => path === k || path.startsWith(k + "/"));
  const page = base ? <FeatureOnly feature={PATH_FEATURE[base]}>{children}</FeatureOnly> : children;
  return perm ? <Access perm={perm} redirect={path === "/dashboard"}>{page}</Access> : page;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/acceptable-use" element={<AcceptableUsePage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/subscribe/:key" element={<SubscribePage />} />
      <Route path="/settings/push" element={<Navigate to="/push" replace />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/pick-plan" element={<PickPlanPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/pay-manually" element={<ManualPaymentPage />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/billing/success" element={<CheckoutSuccessPage />} />
      <Route path="/billing/cancel" element={<CheckoutCancelPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/dashboard" element={<Gate path="/dashboard"><DashboardPage /></Gate>} />
      <Route path="/impersonate-landing" element={<ImpersonateLandingPage />} />
      <Route path="/contacts" element={<Gate path="/contacts"><ContactsPage /></Gate>} />
      <Route path="/contacts/new" element={<Gate path="/contacts/new"><ContactFormPage /></Gate>} />
      <Route path="/contacts/:id/edit" element={<Gate path="/contacts/:id/edit"><ContactFormPage /></Gate>} />
      <Route path="/contacts/trash" element={<Gate path="/contacts/trash"><TrashPage /></Gate>} />
      <Route path="/segments" element={<Gate path="/segments"><SegmentsPage /></Gate>} />
      <Route path="/segments/new" element={<Gate path="/segments/new"><SegmentBuilderPage /></Gate>} />
      <Route path="/segments/templates/new" element={<Gate path="/segments/templates/new"><SegmentBuilderPage /></Gate>} />
      <Route path="/segments/:id" element={<Gate path="/segments/:id"><SegmentDetailPage /></Gate>} />
      <Route path="/segments/:id/edit" element={<Gate path="/segments/:id/edit"><SegmentBuilderPage /></Gate>} />
      <Route path="/campaigns" element={<Gate path="/campaigns"><CampaignsPage /></Gate>} />
      <Route path="/campaigns/suppressed" element={<Gate path="/campaigns/suppressed"><SuppressedPage /></Gate>} />
      <Route path="/mail" element={<Gate path="/mail"><MailPage /></Gate>} />
      <Route path="/email-setup" element={<Gate path="/email-setup"><EmailSetupPage /></Gate>} />
      <Route path="/email-domains" element={<Navigate to="/email-setup?tab=sending" replace />} />
      <Route path="/campaigns/trash" element={<Gate path="/campaigns/trash"><CampaignTrashPage /></Gate>} />
      <Route path="/campaigns/new" element={<Gate path="/campaigns/new"><CampaignEditorPage /></Gate>} />
      <Route path="/campaigns/:id/edit" element={<Gate path="/campaigns/:id/edit"><CampaignEditorPage /></Gate>} />
      <Route path="/campaigns/:id" element={<Gate path="/campaigns/:id"><CampaignDetailPage /></Gate>} />
      <Route path="/analytics" element={<Gate path="/analytics"><AnalyticsPage /></Gate>} />
      <Route path="/social" element={<Gate path="/social"><SocialPage /></Gate>} />
      <Route path="/sms" element={<Gate path="/sms"><ChannelPage channel="sms" /></Gate>} />
      <Route path="/sms/campaigns/new" element={<Gate path="/sms/campaigns/new"><ComposePage channel="sms" /></Gate>} />
      <Route path="/sms/campaigns/:id" element={<Gate path="/sms/campaigns/:id"><MessagingCampaignDetailPage /></Gate>} />
      <Route path="/whatsapp" element={<Gate path="/whatsapp"><ChannelPage channel="whatsapp" /></Gate>} />
      <Route path="/whatsapp/campaigns/new" element={<Gate path="/whatsapp/campaigns/new"><ComposePage channel="whatsapp" /></Gate>} />
      <Route path="/whatsapp/campaigns/:id" element={<Gate path="/whatsapp/campaigns/:id"><MessagingCampaignDetailPage /></Gate>} />
      <Route path="/landing-pages" element={<Gate path="/landing-pages"><LandingPagesPage /></Gate>} />
      <Route path="/landing-pages/new" element={<Gate path="/landing-pages/new"><LandingPageBuilder /></Gate>} />
      <Route path="/landing-pages/:id/edit" element={<Gate path="/landing-pages/:id/edit"><LandingPageBuilder /></Gate>} />
      {/* Public landing page — no auth required */}
      <Route path="/lp/:slug" element={<PublicLandingPage />} />
      <Route path="/workflows" element={<Gate path="/workflows"><WorkflowsPage /></Gate>} />
      <Route path="/workflows/new" element={<Gate path="/workflows/new"><WorkflowBuilder /></Gate>} />
      <Route path="/workflows/:id/edit" element={<Gate path="/workflows/:id/edit"><WorkflowBuilder /></Gate>} />
      <Route path="/crm" element={<Gate path="/crm"><CrmPage /></Gate>} />
      <Route path="/crm/settings" element={<Navigate to="/crm?tab=customize" replace />} />
      <Route path="/contacts/:id" element={<Gate path="/contacts/:id"><ContactDetailPage /></Gate>} />
      <Route path="/seo" element={<Gate path="/seo"><SeoPage /></Gate>} />
      <Route path="/affiliate" element={<Gate path="/affiliate"><AffiliatePage /></Gate>} />
      <Route path="/influencers" element={<Gate path="/influencers"><InfluencersPage /></Gate>} />
      <Route path="/push" element={<Gate path="/push"><PushPage /></Gate>} />
      <Route path="/events" element={<Gate path="/events"><EventsPage /></Gate>} />
      <Route path="/paid-ads" element={<Gate path="/paid-ads"><PaidAdsPage /></Gate>} />
      <Route path="/team" element={<Gate path="/team"><TeamPage /></Gate>} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/connections" element={<Navigate to="/social?tab=accounts" replace />} />
    </Routes>
  );
}
