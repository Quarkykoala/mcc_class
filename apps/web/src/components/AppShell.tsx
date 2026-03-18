import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type AppShellProps = {
  activeView: 'workspace' | 'dashboard';
  onChangeView: (view: 'workspace' | 'dashboard') => void;
  onSignOut: () => void;
  email?: string;
  children: ReactNode;
};

export function AppShell({ activeView, onChangeView, onSignOut, email, children }: AppShellProps) {
  return (
    <div className="md-shell">
      <aside className="md-sidebar">
        <div className="md-sidebar__brand">
          <div className="md-sidebar__brand-mark">M</div>
          <div>
            <p className="md-eyebrow">MCC Letters</p>
            <h1>Command Center</h1>
          </div>
        </div>

        <nav className="md-sidebar__nav" aria-label="Primary">
          <button
            type="button"
            className={`md-nav-item ${activeView === 'workspace' ? 'is-active' : ''}`}
            onClick={() => onChangeView('workspace')}
          >
            <span className="material-icons md-nav-item__icon" aria-hidden="true">edit_note</span>
            <span>Workspace</span>
          </button>
          <button
            type="button"
            className={`md-nav-item ${activeView === 'dashboard' ? 'is-active' : ''}`}
            onClick={() => onChangeView('dashboard')}
          >
            <span className="material-icons md-nav-item__icon" aria-hidden="true">dashboard</span>
            <span>Tracking Dashboard</span>
          </button>
        </nav>

        <div className="md-sidebar__footer">
          <p className="md-eyebrow">Current user</p>
          <p className="md-sidebar__user">{email || 'Unknown user'}</p>
          <p className="md-sidebar__hint">
            Draft, route, approve, issue, print, and track letters from one workflow.
          </p>
        </div>
      </aside>

      <div className="md-main-panel">
        <header className="md-topbar">
          <div>
            <p className="md-eyebrow">Material workflow shell</p>
            <h2 className="md-topbar__title">
              {activeView === 'workspace' ? 'Letter Workspace' : 'Operational Dashboard'}
            </h2>
          </div>
          <div className="md-topbar__actions">
            <Button variant="outline" onClick={onSignOut}>
              <span className="material-icons text-base" aria-hidden="true">logout</span>
              Sign out
            </Button>
          </div>
        </header>

        <main className="md-content">{children}</main>

        <footer className="md-footer">
          <span>Letter lifecycle system</span>
          <span>Tracked workflow for COMPANY context</span>
        </footer>
      </div>
    </div>
  );
}
