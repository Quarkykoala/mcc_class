import type { ReactNode } from 'react';

type AppShellProps = {
  activeView: 'tasks' | 'workspace' | 'dashboard';
  onChangeView: (view: 'tasks' | 'workspace' | 'dashboard') => void;
  onNewBlankLetter: () => void;
  onNewTemplateLetter: () => void;
  email?: string;
  pendingTaskCount?: number;
  children: ReactNode;
};

export function AppShell({ activeView, onChangeView, onNewBlankLetter, onNewTemplateLetter, email, pendingTaskCount = 0, children }: AppShellProps) {
  return (
    <div className="wrapper">
      <div className="sidebar" data-color="purple" data-background-color="black">
        <div className="logo">
          <a href="#" className="logo-link">
            MCC Letters
          </a>
        </div>
        <div className="sidebar-wrapper">
          <ul className="nav">
            <li className={activeView === 'tasks' ? 'active' : ''}>
              <a href="#" onClick={(e) => { e.preventDefault(); onChangeView('tasks'); }}>
                <i className="material-icons">task</i>
                <p>My Tasks {pendingTaskCount > 0 ? `(${pendingTaskCount})` : ''}</p>
              </a>
            </li>
            <li className={activeView === 'workspace' ? 'active' : ''}>
              <a href="#" onClick={(e) => { e.preventDefault(); onChangeView('workspace'); }}>
                <i className="material-icons">edit_note</i>
                <p>Workspace</p>
              </a>
            </li>
            <li className={activeView === 'dashboard' ? 'active' : ''}>
              <a href="#" onClick={(e) => { e.preventDefault(); onChangeView('dashboard'); }}>
                <i className="material-icons">dashboard</i>
                <p>Dashboard</p>
              </a>
            </li>
          </ul>

          <div className="mt-auto px-4 pt-10 pb-4">
             <div className="rounded-lg bg-white/10 p-4 text-white/70">
                <p className="text-xs font-bold uppercase mb-2">Current user</p>
                <p className="text-sm font-medium text-white truncate mb-1">{email || 'Unknown'}</p>
                <p className="text-[11px] leading-relaxed opacity-60">
                  Draft, route, and track letters from one workflow.
                </p>
             </div>
          </div>
        </div>
        <div 
          className="sidebar-background" 
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600)' }} 
        />
      </div>

      <div className="main-panel">
        <nav className="navbar navbar-transparent navbar-absolute fixed-top">
          <div className="container-fluid px-6 flex justify-between items-center w-full">
            <div className="navbar-wrapper">
              <a className="navbar-brand" href="#">
                {activeView === 'tasks' ? 'My Tasks' : activeView === 'workspace' ? 'Letter Workspace' : 'Operational Dashboard'}
              </a>
            </div>
            
            <div className="flex items-center gap-4">
               <button
                 onClick={onNewBlankLetter}
                 className="btn btn-white btn-round flex items-center gap-2 px-4 py-2 shadow-sm"
               >
                 <i className="material-icons text-lg">add</i>
                 <span className="text-xs font-bold">BLANK LETTER</span>
               </button>
               <button
                 onClick={onNewTemplateLetter}
                 className="btn btn-primary btn-round flex items-center gap-2 px-4 py-2 shadow-sm"
               >
                 <i className="material-icons text-lg">description</i>
                 <span className="text-xs font-bold">USE TEMPLATE</span>
               </button>
            </div>
          </div>
        </nav>

        <div className="content">
          <div className="container-fluid">
            {children}
          </div>
        </div>

        <footer className="footer py-6 px-8 flex justify-between items-center text-xs text-gray-500 border-t border-gray-200 mt-auto bg-white/50">
          <div className="container-fluid flex justify-between w-full">
            <nav className="flex gap-4">
               <a href="#" className="font-bold text-gray-600 uppercase">Company</a>
               <a href="#" className="font-bold text-gray-600 uppercase">Portfolio</a>
               <a href="#" className="font-bold text-gray-600 uppercase">Blog</a>
            </nav>
            <p className="copyright font-medium">
              &copy; {new Date().getFullYear()} MCC Letters, tracked workflow system.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
