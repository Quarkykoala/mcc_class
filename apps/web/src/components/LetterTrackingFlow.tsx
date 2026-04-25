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

const commonNodeStyle = {
    padding: '12px 16px',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 400,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '200px',
    boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.14), 0 7px 10px -5px rgba(0, 0, 0, 0.4)',
    border: '0',
    fontFamily: "'Roboto', sans-serif",
};

const CustomNode = ({ data }: { data: any }) => {
    let bg = 'linear-gradient(60deg, #eee, #bdbdbd)';
    let icon = <Clock size={16} />;

    if (data.status === 'completed') {
        bg = 'linear-gradient(60deg, #66bb6a, #43a047)';
        icon = <Check size={16} />;
    } else if (data.status === 'current') {
        bg = 'linear-gradient(60deg, #ab47bc, #8e24aa)';
        icon = <Clock size={16} className="animate-pulse" />;
    } else if (data.status === 'rejected') {
        bg = 'linear-gradient(60deg, #ef5350, #e53935)';
        icon = <X size={16} />;
    }

    if (data.label === 'Draft Created') icon = <FileText size={16} />;
    if (data.label === 'Committee Review') icon = <UserCheck size={16} />;
    if (data.label === 'Issued') icon = <Printer size={16} />;

    return (
        <div style={{ ...commonNodeStyle, background: bg }}>
            <Handle type="target" position={Position.Left} style={{ background: '#fff', border: '1px solid #999' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>{data.label}</div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>{data.subLabel || 'Pending'}</div>
            </div>
            <Handle type="source" position={Position.Right} style={{ background: '#fff', border: '1px solid #999' }} />
        </div>
    );
};

const nodeTypes = { custom: CustomNode };

interface LetterTrackingFlowProps {
    letter: any;
    auditLogs: any[];
}

export function LetterTrackingFlow({ letter }: LetterTrackingFlowProps) {
    const isDraft = letter.status === 'DRAFT';
    const isApproved = letter.status === 'APPROVED' || letter.status === 'ISSUED';
    const isIssued = letter.status === 'ISSUED';
    const isRejected = letter.status === 'REJECTED';

    const nDraft = {
        id: '1',
        type: 'custom',
        position: { x: 50, y: 100 },
        data: { label: 'Draft Created', status: 'completed', subLabel: new Date(letter.created_at).toLocaleDateString() }
    };

    let nApprovalStatus = 'pending';
    let nApprovalSub = 'Waiting for review';
    if (isApproved || isIssued) {
        nApprovalStatus = 'completed';
        nApprovalSub = 'Approved';
    } else if (isRejected) {
        nApprovalStatus = 'rejected';
        nApprovalSub = 'Rejected';
    } else if (isDraft) {
        nApprovalStatus = 'current';
    }

    const nApproval = {
        id: '2',
        type: 'custom',
        position: { x: 350, y: 100 },
        data: { label: 'Approved', status: nApprovalStatus, subLabel: nApprovalSub }
    };

    let nIssuedStatus = 'pending';
    let nIssuedSub = 'Not issued yet';
    if (isIssued) {
        nIssuedStatus = 'completed';
        nIssuedSub = 'Issued / Printed';
    } else if (isApproved) {
        nIssuedStatus = 'current';
    }

    const nIssued = {
        id: '3',
        type: 'custom',
        position: { x: 650, y: 100 },
        data: { label: 'Issued', status: nIssuedStatus, subLabel: nIssuedSub }
    };

    const initialNodes: Node[] = [nDraft, nApproval, nIssued];
    const initialEdges: Edge[] = [
        { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', animated: nApprovalStatus === 'current', style: { stroke: '#9c27b0', strokeWidth: 3, opacity: 0.3 } },
        { id: 'e2-3', source: '2', target: '3', type: 'smoothstep', animated: nIssuedStatus === 'current', style: { stroke: '#9c27b0', strokeWidth: 3, opacity: 0.3 } }
    ];

    return (
        <div style={{ width: '100%', height: '350px', background: '#f8f9fa', border: '1px solid #eee', borderRadius: '12px' }}>
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#e9ecef" gap={20} />
                <Controls />
            </ReactFlow>
        </div>
    );
}
