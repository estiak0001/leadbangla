import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicPage, submitPublicForm,
  type FormBlock, type PublicPage,
} from "../../lib/landingPages";

function HeroSection({ heading, subheading }: { heading: string; subheading: string }) {
  return (
    <div className="bg-gradient-to-br from-brand-600 to-purple-600 text-white py-20 px-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight leading-tight max-w-2xl mx-auto">{heading}</h1>
      {subheading && (
        <p className="mt-4 text-lg text-brand-100 max-w-xl mx-auto leading-relaxed">{subheading}</p>
      )}
    </div>
  );
}

function TextSection({ content }: { content: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 text-surface-600 text-base leading-relaxed whitespace-pre-wrap">{content}</div>
  );
}

function FormSection({ block, slug }: { block: FormBlock; slug: string }) {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState("");

  const handleChange = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setError("");
    try { await submitPublicForm(slug, values); setSuccess(true); }
    catch (err: any) { setError(err.message || "Something went wrong. Please try again."); }
    finally { setSubmitting(false); }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <p className="text-xl font-semibold text-surface-900">{block.success_message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <form onSubmit={handleSubmit} className="space-y-4">
        {block.fields.map((field) => (
          <div key={field.id ?? field.name}>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              {field.label}
              {field.required && <span className="text-danger-base ml-0.5">*</span>}
            </label>
            {field.field_type === "textarea" ? (
              <textarea
                name={field.name} required={field.required}
                value={values[field.name] ?? ""} onChange={(e) => handleChange(field.name, e.target.value)}
                rows={4}
                className="w-full border border-surface-200 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white resize-none"
              />
            ) : (
              <input
                type={field.field_type} name={field.name} required={field.required}
                value={values[field.name] ?? ""} onChange={(e) => handleChange(field.name, e.target.value)}
                className="w-full border border-surface-200 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white"
              />
            )}
          </div>
        ))}

        {error && (
          <div className="rounded-md bg-danger-light border border-danger-base/30 px-4 py-3 text-sm text-danger-dark">{error}</div>
        )}

        <button
          type="submit" disabled={submitting}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-semibold py-3 rounded-md transition-colors text-base shadow-brand-glow/30 shadow-md"
        >
          {submitting ? "Submitting…" : block.submit_label}
        </button>
      </form>
    </div>
  );
}

export default function PublicLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage]       = useState<PublicPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getPublicPage(slug).then(setPage).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="inline-block w-8 h-8 rounded-full border-2 border-surface-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-surface-900">Page not found</h1>
        <p className="text-surface-500 mt-2">This landing page doesn't exist or is no longer published.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-surface-50 border-b border-surface-100 py-2 px-4 text-center text-xs text-surface-600">
        Powered by <span className="font-semibold text-brand-600">LeadBangla</span>
      </div>
      {page.blocks.map((block, i) => {
        if (block.type === "hero") return <HeroSection key={i} heading={block.heading} subheading={block.subheading} />;
        if (block.type === "text") return <TextSection key={i} content={block.content} />;
        if (block.type === "form" && slug) return <FormSection key={i} block={block} slug={slug} />;
        return null;
      })}
    </div>
  );
}
