import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, EllipsisVertical, Plus, Share, X } from 'lucide-react';
import { installState, promptInstall, subscribe } from '@/lib/install';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal, toast } from './common';

const DISMISS_KEY = 'fh-install-dismissed';

let snapshot = installState();
const getSnapshot = () => {
  const next = installState();
  if (next.canPrompt !== snapshot.canPrompt || next.installed !== snapshot.installed) snapshot = next;
  return snapshot;
};

export function useInstall() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
      <span className="pt-0.5 text-sm">{children}</span>
    </li>
  );
}

function Instructions({ platform }) {
  if (platform === 'ios') {
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Open this page in <strong>Safari</strong>.
        </Step>
        <Step n={2}>
          Tap the <Share className="inline h-4 w-4 align-text-bottom" /> <strong>Share</strong> button in the toolbar.
        </Step>
        <Step n={3}>
          Scroll down and tap <Plus className="inline h-4 w-4 align-text-bottom" /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
        </Step>
        <Step n={4}>Open Finance Hub from your home screen. You can then turn on reminders in Settings.</Step>
      </ol>
    );
  }
  return (
    <ol className="space-y-3">
      <Step n={1}>
        Open this page in <strong>Chrome</strong> or <strong>Edge</strong>.
      </Step>
      <Step n={2}>
        {platform === 'android' ? (
          <>
            Tap the <EllipsisVertical className="inline h-4 w-4 align-text-bottom" /> menu, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
          </>
        ) : (
          <>
            Click the install icon at the right end of the address bar, or open the <EllipsisVertical className="inline h-4 w-4 align-text-bottom" /> menu and choose{' '}
            <strong>Install Finance Hub</strong>.
          </>
        )}
      </Step>
      <Step n={3}>Finance Hub opens in its own window and appears with your other apps.</Step>
    </ol>
  );
}

/** Shows the install guide, or the browser's own prompt when one is available. */
export function useInstallAction() {
  const state = useInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  async function install() {
    if (state.canPrompt) {
      if (await promptInstall()) toast('Finance Hub installed');
    } else {
      setHelpOpen(true);
    }
  }
  const help = (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Install Finance Hub" description="Add it to your device so it opens like an app and can send you reminders.">
      <Instructions platform={state.platform} />
    </Modal>
  );
  return { ...state, install, help };
}

/** Banner shown every time the site is opened, until the app is installed. Dismissing hides it for this visit. */
export default function InstallPrompt({ className }) {
  const { installed, install, help } = useInstallAction();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!dismissed) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  }, [dismissed]);

  if (installed) return null;
  return (
    <>
      {!dismissed && (
        <div className={cn('flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm', className)} role="region" aria-label="Install the app">
          <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Get the Finance Hub app</div>
            <div className="text-xs text-muted-foreground">Install it for one-tap logging and daily reminders.</div>
          </div>
          <Button size="sm" onClick={install}>
            <Download /> Install
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => setDismissed(true)} aria-label="Not now">
            <X />
          </Button>
        </div>
      )}
      {help}
    </>
  );
}
