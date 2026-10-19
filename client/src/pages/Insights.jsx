import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, Send, Sparkles } from 'lucide-react';
import { useApi, useApp } from '../context';
import { api } from '../lib/api';
import { currentMonth, inr, monthLabel } from '../lib/format';
import { Empty, ErrorText, Loading, MonthPicker, PageHeader, Spinner, toast } from '../components/ui';
import { BarList } from '../components/charts';

const LEVEL = {
  critical: { icon: OctagonAlert, cls: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300', label: 'Urgent' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300', label: 'Watch' },
  good: { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Good' },
  info: { icon: Info, cls: 'text-brand-600 bg-brand-50 dark:bg-brand-900/40 dark:text-brand-300', label: 'Tip' },
};

export function RecommendationList({ items, compact }) {
  if (!items?.length) return <p className="muted text-sm">No suggestions right now.</p>;
  return (
    <ul className="space-y-3">
      {items.map((r, i) => {
        const L = LEVEL[r.level] || LEVEL.info;
        return (
          <li key={i} className="flex gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${L.cls}`} title={L.label}>
              <L.icon size={16} aria-label={L.label} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{r.title}</div>
              {!compact && <div className="muted mt-0.5 text-sm">{r.detail}</div>}
              {compact && <div className="muted line-clamp-2 text-xs">{r.detail}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function Insights() {
  const { viewingAll, isAdmin } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const status = useApi('/insights/ai/status');
  const summary = useApi('/insights/summary', { month }, [month]);
  const reports = useApi('/insights/ai/reports');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const provider = status.data?.provider;
  const advice = summary.data?.advice;

  async function analyse(e) {
    e?.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const r = await api('/insights/ai/analyse', { method: 'POST', params: { month }, body: { question } });
      setResult({ ...r, month });
      if (r.error) setError(new Error(`The AI service had a problem (${r.error}). Showing built-in advice instead.`));
      else if (!r.provider) toast('Built-in advice updated below. Add a free AI key for a written analysis.');
      summary.reload();
      reports.reload();
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  }

  // Show this run's answer, or the last saved report for the month.
  const shown = result?.month === month && result.content ? result : reports.data?.find((r) => r.month === month);
  const aiText = shown?.content;

  return (
    <>
      <PageHeader
        title="AI advisor"
        subtitle="How much to invest, and how to spend smarter"
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      {isAdmin && viewingAll ? (
        <div className="card">
          <Empty icon={Sparkles} title="Pick a person" text="Choose Darsh or Bhakti from the “Viewing” menu at the top to analyse their finances." />
        </div>
      ) : (
        <>
          <section className="card relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-violet-500/10 to-transparent" />
            <div className="relative p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg shadow-brand-500/30">
                  <Sparkles size={20} />
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold">Analyse {monthLabel(month)}</h2>
                  <p className="muted text-xs">
                    {provider
                      ? `Powered by ${provider === 'groq' ? 'Groq (free tier)' : provider === 'gemini' ? 'Google Gemini (free tier)' : 'Ollama (local, free)'}`
                      : 'Using the built-in advisor. Add a free Groq or Gemini key on the server for AI-written advice.'}
                  </p>
                </div>
              </div>
              <form onSubmit={analyse} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  className="input flex-1"
                  placeholder="Optional: ask something, e.g. “Can I afford a ₹60k phone in 3 months?”"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <button className="btn-primary" disabled={running}>
                  {running ? <Spinner className="text-white" /> : <Send size={16} />}
                  {running ? 'Analysing…' : 'Analyse my finances'}
                </button>
              </form>
              <div className="mt-3">
                <ErrorText error={error} />
              </div>
              {aiText && (
                <div className="prose-ai mt-4 rounded-2xl border border-black/5 bg-white/80 p-5 dark:border-white/10 dark:bg-ink-850/80">
                  <ReactMarkdown>{aiText}</ReactMarkdown>
                  {shown.provider && <p className="muted mt-3 text-xs">Generated by {shown.provider}</p>}
                </div>
              )}
            </div>
          </section>

          {summary.loading && !summary.data ? (
            <Loading />
          ) : (
            advice && (
              <div className="mt-4 grid gap-4 lg:grid-cols-5">
                <section className="card card-pad lg:col-span-2">
                  <span className="muted text-sm font-medium">Suggested monthly investment</span>
                  <div className="mt-1 text-3xl font-bold tracking-tight text-violet-600 dark:text-violet-300">{inr(advice.suggestedInvest)}</div>
                  <p className="muted mt-1 text-xs">
                    Already invested this month: {inr(summary.data.invested)} · SIPs {inr(summary.data.sipMonthly)}/month
                  </p>
                  {advice.allocation.length > 0 && (
                    <>
                      <h3 className="mb-3 mt-5 text-sm font-semibold">A simple split</h3>
                      <BarList rows={advice.allocation.map((a) => ({ key: a.bucket, total: a.amount }))} />
                    </>
                  )}
                  {advice.budgetSplit && (
                    <>
                      <h3 className="mb-2 mt-6 text-sm font-semibold">50 / 30 / 20 budget for your income</h3>
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        {[
                          ['Needs', advice.budgetSplit.needs, summary.data.needs],
                          ['Wants', advice.budgetSplit.wants, summary.data.wants],
                          ['Invest (min.)', advice.budgetSplit.invest, summary.data.invested],
                        ].map(([label, target, actual]) => (
                          <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-ink-850">
                            <div className="muted text-xs">{label}</div>
                            <div className="font-semibold">{inr(target)}</div>
                            <div className={`text-xs ${label.startsWith('Invest') ? (actual >= target ? 'text-emerald-600' : 'muted') : actual > target ? 'text-red-600 dark:text-red-400' : 'muted'}`}>
                              actual {inr(actual)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="muted mt-5 text-xs">Emergency fund goal: {inr(advice.emergencyTarget)} (6 months of expenses).</p>
                </section>
                <section className="card card-pad lg:col-span-3">
                  <h2 className="mb-4 font-semibold">What to work on</h2>
                  <RecommendationList items={advice.recommendations} />
                  <p className="muted mt-6 text-xs">This is general guidance based on your entries, not regulated financial advice.</p>
                </section>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}
