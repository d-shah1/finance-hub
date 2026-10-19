import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, Send, Sparkles } from 'lucide-react';
import { useApi, useApp } from '@/context';
import { api } from '@/lib/api';
import { currentMonth, inr, monthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Empty, ErrorText, Loading, MonthPicker, PageHeader, Section, Spinner, toast } from '@/components/common';
import { BarList } from '@/components/charts';

const LEVEL = {
  critical: { icon: OctagonAlert, cls: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300', label: 'Urgent' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300', label: 'Watch' },
  good: { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Good' },
  info: { icon: Info, cls: 'text-primary bg-primary/10', label: 'Tip' },
};

export function RecommendationList({ items, compact }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">No suggestions right now.</p>;
  return (
    <ul className="space-y-3">
      {items.map((r, i) => {
        const L = LEVEL[r.level] || LEVEL.info;
        return (
          <li key={i} className="flex gap-3">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', L.cls)} title={L.label}>
              <L.icon className="h-4 w-4" aria-label={L.label} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{r.title}</div>
              {!compact && <div className="mt-0.5 text-sm text-muted-foreground">{r.detail}</div>}
              {compact && <div className="line-clamp-2 text-xs text-muted-foreground">{r.detail}</div>}
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
        <Card>
          <Empty icon={Sparkles} title="Pick a person" text="Choose Darsh or Bhakti from the “Viewing” menu at the top to analyse their finances." />
        </Card>
      ) : (
        <>
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-violet-500/10 to-transparent" />
            <div className="relative p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg shadow-primary/30">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold">Analyse {monthLabel(month)}</h2>
                  <p className="text-xs text-muted-foreground">
                    {provider
                      ? `Powered by ${provider === 'groq' ? 'Groq (free tier)' : provider === 'gemini' ? 'Google Gemini (free tier)' : 'Ollama (local, free)'}`
                      : 'Using the built-in advisor. Add a free Groq or Gemini key on the server for AI-written advice.'}
                  </p>
                </div>
              </div>
              <form onSubmit={analyse} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  className="h-10 flex-1 bg-background"
                  placeholder="Optional: ask something, e.g. “Can I afford a ₹60k phone in 3 months?”"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <Button type="submit" className="h-10" disabled={running}>
                  {running ? <Spinner /> : <Send />}
                  {running ? 'Analysing…' : 'Analyse my finances'}
                </Button>
              </form>
              <div className="mt-3">
                <ErrorText error={error} />
              </div>
              {aiText && (
                <div className="prose-ai mt-4 rounded-lg border bg-background/80 p-5">
                  <ReactMarkdown>{aiText}</ReactMarkdown>
                  {shown.provider && <p className="mt-3 text-xs text-muted-foreground">Generated by {shown.provider}</p>}
                </div>
              )}
            </div>
          </Card>

          {summary.loading && !summary.data ? (
            <Loading />
          ) : (
            advice && (
              <div className="mt-4 grid gap-4 lg:grid-cols-5">
                <Card className="p-5 lg:col-span-2">
                  <span className="text-sm font-medium text-muted-foreground">Suggested monthly investment</span>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-violet-600 dark:text-violet-300">{inr(advice.suggestedInvest)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
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
                          <div key={label} className="rounded-lg bg-muted p-3">
                            <div className="text-xs text-muted-foreground">{label}</div>
                            <div className="font-semibold">{inr(target)}</div>
                            <div className={`text-xs ${label.startsWith('Invest') ? (actual >= target ? 'text-emerald-600' : 'text-muted-foreground') : actual > target ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                              actual {inr(actual)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="mt-5 text-xs text-muted-foreground">Emergency fund goal: {inr(advice.emergencyTarget)} (6 months of expenses).</p>
                </Card>
                <Section className="lg:col-span-3" title="What to work on">
                  <RecommendationList items={advice.recommendations} />
                  <p className="mt-6 text-xs text-muted-foreground">This is general guidance based on your entries, not regulated financial advice.</p>
                </Section>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}
