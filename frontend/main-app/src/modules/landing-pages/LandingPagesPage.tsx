import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus, ExternalLink } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import Spinner from "../../components/Spinner";
import { fetchLandingPages, deleteLandingPage, type LandingPage } from "../../lib/landingPages";
import { confirmText } from "../../components/ConfirmDialog";

export default function LandingPagesPage() {
  const [pages, setPages]     = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = () => {
    setLoading(true);
    fetchLandingPages().then(setPages).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirmText(`Delete "${title}"? This cannot be undone.`))) return;
    try { await deleteLandingPage(id); setPages((prev) => prev.filter((p) => p.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Landing Pages"
        description="Build and publish landing pages that capture leads directly into your contacts."
        actions={
          <Link to="/landing-pages/new">
            <Button size="sm" icon={<Plus size={16} />}>New Page</Button>
          </Link>
        }
      />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : pages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={40} />}
            title="No landing pages yet"
            description="Create your first page to start capturing leads."
            action={<Link to="/landing-pages/new"><Button size="sm" icon={<Plus size={15} />}>Create Landing Page</Button></Link>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => (
            <Card key={page.id}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-surface-900 truncate">{page.title}</span>
                    <Badge variant={page.is_published ? "success" : "default"} size="sm" dot>
                      {page.is_published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-surface-600 flex-wrap">
                    <span>Slug: <code className="font-mono bg-surface-100 px-1.5 py-0.5 rounded text-surface-600">{page.slug}</code></span>
                    <span>{page.submission_count} submission{page.submission_count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {page.is_published && (
                    <a href={`/lp/${page.slug}`} target="_blank" rel="noopener noreferrer">
                      <Button size="xs" variant="ghost" icon={<ExternalLink size={12} />}>View</Button>
                    </a>
                  )}
                  <Link to={`/landing-pages/${page.id}/edit`}>
                    <Button size="xs" variant="secondary">Edit</Button>
                  </Link>
                  <Button size="xs" variant="danger" onClick={() => handleDelete(page.id, page.title)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
