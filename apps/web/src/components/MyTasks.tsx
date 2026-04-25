type Letter = any;

type MyTasksProps = {
  currentUserId?: string;
  letters: Letter[];
  pendingApprovals: Letter[];
  onOpenLetter: (id: string) => void;
};

const formatWhen = (value?: string) => {
  if (!value) return 'No timestamp';
  return new Date(value).toLocaleString();
};

export function MyTasks({ currentUserId, letters, pendingApprovals, onOpenLetter }: MyTasksProps) {
  const myDrafts = letters
    .filter((letter) => letter.status === 'DRAFT' && (!currentUserId || !letter.created_by || letter.created_by === currentUserId))
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime());

  const needsRevision = letters
    .filter((letter) => letter.status === 'REJECTED' && (!currentUserId || !letter.created_by || letter.created_by === currentUserId))
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime());

  const recentlyCompleted = letters
    .filter((letter) => letter.status === 'APPROVED' || letter.status === 'ISSUED')
    .slice(0, 6);

  const sections = [
    {
      title: 'Needs My Approval',
      subtitle: 'Letters waiting for your decision.',
      badgeClass: 'bg-warning text-white',
      empty: 'No letters are currently waiting for your approval.',
      letters: pendingApprovals
    },
    {
      title: 'My Drafts',
      subtitle: 'Letters you still need to finish and send.',
      badgeClass: 'bg-info text-white',
      empty: 'No open drafts right now.',
      letters: myDrafts
    },
    {
      title: 'Needs Revision',
      subtitle: 'Rejected letters that should be updated and resubmitted.',
      badgeClass: 'bg-danger text-white',
      empty: 'No returned letters need revision.',
      letters: needsRevision
    }
  ];

  return (
    <div className="space-y-8">
      <div className="card">
        <div className="card-header card-header-warning">
          <h4 className="card-title">My Tasks</h4>
          <p className="card-category">This is the fastest place to see what needs your action.</p>
        </div>
        <div className="card-body grid gap-4 md:grid-cols-3">
          <div className="p-5 rounded-xl bg-warning/10 border border-warning/20">
            <p className="text-[11px] font-bold uppercase text-warning">Pending Approval</p>
            <p className="text-3xl font-bold text-gray-700 mt-2">{pendingApprovals.length}</p>
          </div>
          <div className="p-5 rounded-xl bg-info/10 border border-info/20">
            <p className="text-[11px] font-bold uppercase text-info">Open Drafts</p>
            <p className="text-3xl font-bold text-gray-700 mt-2">{myDrafts.length}</p>
          </div>
          <div className="p-5 rounded-xl bg-danger/10 border border-danger/20">
            <p className="text-[11px] font-bold uppercase text-danger">Needs Revision</p>
            <p className="text-3xl font-bold text-gray-700 mt-2">{needsRevision.length}</p>
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="card">
          <div className="card-header card-header-primary">
            <h4 className="card-title">{section.title}</h4>
            <p className="card-category">{section.subtitle}</p>
          </div>
          <div className="card-body p-6 space-y-3">
            {section.letters.length === 0 ? (
              <div className="py-10 text-center text-gray-400 italic">{section.empty}</div>
            ) : (
              section.letters.map((letter) => (
                <button
                  key={letter.id}
                  type="button"
                  className={`w-full p-5 rounded-xl border text-left hover:bg-gray-50 transition-all ${(letter.approval_summary?.pending ?? 0) > 0 ? 'border-l-4 border-l-warning border-y-gray-100 border-r-gray-100 bg-warning/5' : 'border-gray-100 bg-white'}`}
                  onClick={() => onOpenLetter(letter.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-bold text-gray-700">{letter.title || 'Untitled letter'}</p>
                      <div className="flex flex-col gap-1 mt-1">
                        <p className="text-xs text-gray-500">
                          {letter.job_reference ? `C Number: ${letter.job_reference}` : (letter.subject || 'No C Number')}
                        </p>
                        {letter.departments?.name && (
                          <p className="text-[10px] text-primary font-medium uppercase tracking-wider">
                            Originating Department: {letter.departments.name}
                          </p>
                        )}
                        {(letter.approval_summary?.pending ?? 0) > 0 && (
                          <p className="text-xs text-warning font-extrabold uppercase tracking-widest mt-1 bg-warning/10 px-2 py-1 rounded inline-block w-fit">
                            Waiting on {letter.approval_summary.pending} department approver(s)
                          </p>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 font-bold uppercase mt-3">{formatWhen(letter.updated_at || letter.created_at)}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${section.badgeClass}`}>
                      {letter.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ))}

      <div className="card">
        <div className="card-header card-header-info">
          <h4 className="card-title">Recently Completed</h4>
          <p className="card-category">Approved or issued letters you may want to reference.</p>
        </div>
        <div className="card-body p-6 space-y-3">
          {recentlyCompleted.length === 0 ? (
            <div className="py-10 text-center text-gray-400 italic">No recent completed letters yet.</div>
          ) : (
            recentlyCompleted.map((letter) => (
              <button
                key={letter.id}
                type="button"
                className="w-full p-4 rounded-xl border border-gray-100 bg-white text-left hover:bg-gray-50 transition-all"
                onClick={() => onOpenLetter(letter.id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-gray-700">{letter.title || 'Untitled letter'}</p>
                    <p className="text-[11px] text-gray-500 mt-1">{formatWhen(letter.updated_at || letter.created_at)}</p>
                  </div>
                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-success text-white">{letter.status}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
