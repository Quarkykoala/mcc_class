import ReactFlow, {
    Handle,
    Position,
    Background,
    Controls,
    type Node,
    type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Check, Clock, X, FileText, UserCheck, Printer } from 'lucide-react';

// --- Custom Node Styles (n8n-ish) ---
const commonNodeStyle = {
    padding: '10px 15px',
    borderRadius: '8px',
    border: '1px solid #555',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '180px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
};

const CustomNode = ({ data }: { data: any }) => {
    let bg = '#1f2937'; // Default Gray/Dark
    let border = '#374151';
    let icon = <Clock size={14} />;

    if (data.status === 'completed') {
        bg = '#059669'; // Emerald 600
        border = '#10b981';
        icon = <Check size={14} />;
    } else if (data.status === 'current') {
        bg = '#2563eb'; // Blue 600
        border = '#3b82f6';
        icon = <Clock size={14} className="animate-pulse" />;
    } else if (data.status === 'rejected') {
        bg = '#dc2626'; // Red 600
        border = '#ef4444';
        icon = <X size={14} />;
    }

    // specific icons
    if (data.label === 'Draft Created') icon = <FileText size={14} />;
    if (data.label === 'Committee Review') icon = <UserCheck size={14} />;
    if (data.label === 'Approved') icon = <Check size={14} />;
    if (data.label === 'Issued') icon = <Printer size={14} />;

    return (
        <div style={{ ...commonNodeStyle, backgroundColor: bg, borderColor: border }}>
            <Handle type="target" position={Position.Left} style={{ background: '#888' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', marginRight: '8px' }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{data.label}</div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>{data.subLabel || 'Pending'}</div>
            </div>
            <Handle type="source" position={Position.Right} style={{ background: '#888' }} />
        </div>
    );
};

const nodeTypes = { custom: CustomNode };

interface LetterTrackingFlowProps {
    letter: any;
    auditLogs: any[];
}

export function LetterTrackingFlow({ letter }: LetterTrackingFlowProps) {
    // Simple Mapping for MVP:
    // DRAFT -> (Submitted) -> APPROVED -> ISSUED

    const isDraft = letter.status === 'DRAFT';
    const isApproved = letter.status === 'APPROVED' || letter.status === 'ISSUED';
    const isIssued = letter.status === 'ISSUED';
    const isRejected = letter.status === 'REJECTED';

    // Draft Node
    const nDraft = {
        id: '1',
        type: 'custom',
        position: { x: 50, y: 100 },
        data: { label: 'Draft Created', status: 'completed', subLabel: new Date(letter.created_at).toLocaleDateString() }
    };

    // Approval Node
    let nApprovalStatus = 'pending';
    let nApprovalSub = 'Waiting for review';
    if (isApproved || isIssued) {
        nApprovalStatus = 'completed';
        nApprovalSub = 'Approved';
    } else if (isRejected) {
        nApprovalStatus = 'rejected';
        nApprovalSub = 'Rejected';
    } else if (isDraft) {
        nApprovalStatus = 'current'; // Waiting for approval
    }

    const nApproval = {
        id: '2',
        type: 'custom',
        position: { x: 300, y: 100 },
        data: { label: 'Approved', status: nApprovalStatus, subLabel: nApprovalSub }
    };

    // Issued Node
    let nIssuedStatus = 'pending';
    let nIssuedSub = 'Not printed yet';
    if (isIssued) {
        nIssuedStatus = 'completed';
        nIssuedSub = 'Printed / Issued';
    } else if (isApproved) {
        nIssuedStatus = 'current'; // Ready to print
    }

    const nIssued = {
        id: '3',
        type: 'custom',
        position: { x: 550, y: 100 },
        data: { label: 'Issued', status: nIssuedStatus, subLabel: nIssuedSub }
    };

    const initialNodes: Node[] = [nDraft, nApproval, nIssued];
    const initialEdges: Edge[] = [
        { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', animated: nApprovalStatus === 'current', style: { stroke: '#888', strokeWidth: 2 } },
        { id: 'e2-3', source: '2', target: '3', type: 'smoothstep', animated: nIssuedStatus === 'current', style: { stroke: '#888', strokeWidth: 2 } }
    ];

    return (
        <div style={{ width: '100%', height: '300px', background: '#111', borderRadius: '8px' }}>
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#333" gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    );
}
