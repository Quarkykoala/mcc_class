import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export const normalizeTagIds = (tagIds: unknown): string[] => {
  if (!Array.isArray(tagIds)) return [];
  const cleaned = tagIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  return Array.from(new Set(cleaned)).sort();
};

export const buildContentHash = ({
  letterId,
  versionNumber,
  context,
  departmentId,
  tagIds,
  content
}: {
  letterId: string;
  versionNumber: number;
  context: string;
  departmentId: string;
  tagIds: string[];
  content: string;
}): string => {
  const payload = {
    letter_id: letterId,
    version: versionNumber,
    context,
    department_id: departmentId,
    tag_ids: tagIds,
    content
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

type Approval = { approved_at?: string; approver_id?: string; committee_id?: string };
type VerificationRecord = {
  version_number: number;
  letters: {
    context: string;
    status: string;
    departments?: { name?: string };
    letter_number?: number;
    rejected_at?: string;
    rejection_reason?: string;
  };
  approvals?: Approval[];
  committee_approvals?: Approval[];
  issuances?: { id: string; issued_at?: string; issued_by?: string }[];
};

const latestApproval = (items: Approval[] | undefined): Approval | null => {
  if (!items || items.length === 0) return null;
  return items.reduce((latest, current) => {
    if (!latest) return current;
    const latestTime = latest.approved_at ? Date.parse(latest.approved_at) : 0;
    const currentTime = current.approved_at ? Date.parse(current.approved_at) : 0;
    return currentTime >= latestTime ? current : latest;
  }, items[0] ?? null);
};

export const buildVerificationResponse = (record: VerificationRecord) => {
  const letter = record.letters;
  const issuances = record.issuances ?? [];
  const approvals = record.approvals ?? [];
  const committeeApprovals = record.committee_approvals ?? [];
  const issuance = issuances.length > 0 ? issuances[0] : null;

  if (letter.status === 'REVOKED') {
    return {
      valid: false,
      status: 'revoked',
      message: 'Document has been revoked.',
      document_details: {
        id: null,
        context: letter.context,
      department: letter.departments?.name,
      status: letter.status,
      issued_at: issuance?.issued_at ?? null,
      issued_by: issuance?.issued_by ?? null,
      letter_number: letter.letter_number ?? null,
      approved_by: null,
        approved_at: null,
        approved_via: null,
        committee_id: null,
        issuance_exists: false,
        version_number: record.version_number
      }
    };
  }

  const latestCommittee = latestApproval(committeeApprovals);
  const latestDirect = latestApproval(approvals);
  const latestCommitteeTime = latestCommittee?.approved_at ? Date.parse(latestCommittee.approved_at) : -1;
  const latestDirectTime = latestDirect?.approved_at ? Date.parse(latestDirect.approved_at) : -1;

  const useCommittee = latestCommittee && latestCommitteeTime >= latestDirectTime;
  const selectedApproval = useCommittee ? latestCommittee : latestDirect;

  return {
    valid: true,
    status: 'valid',
    document_details: {
      id: null,
      context: letter.context,
      department: letter.departments?.name,
      status: letter.status,
      issued_at: issuance?.issued_at ?? null,
      issued_by: issuance?.issued_by ?? null,
      letter_number: letter.letter_number ?? null,
      approved_by: selectedApproval?.approver_id ?? null,
      approved_at: selectedApproval?.approved_at ?? null,
      approved_via: selectedApproval
        ? (useCommittee ? 'COMMITTEE' : 'APPROVER')
        : null,
      committee_id: useCommittee ? selectedApproval?.committee_id ?? null : null,
      issuance_exists: issuances.length > 0,
      version_number: record.version_number
    }
  };
};

export const generateIssuancePdf = async ({
  context,
  departmentName,
  content,
  contentHash,
  verificationUrl,
  issuedAt,
  letterNumber
}: {
  context: string;
  departmentName: string;
  content: string;
  contentHash: string;
  verificationUrl: string;
  issuedAt: Date;
  letterNumber?: number;
}): Promise<string> => {
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Evidence-Backed Letter', 20, 20);
  
  if (letterNumber) {
    doc.setFontSize(12);
    doc.text(`Ref #${letterNumber}`, 150, 20);
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Context: ${context}`, 20, 30);
  doc.text(`Department: ${departmentName}`, 20, 38);
  doc.text(`Issued: ${issuedAt.toISOString()}`, 20, 46);
  doc.text(`Hash: ${contentHash}`, 20, 54);
  doc.text('Content:', 20, 66);
  doc.text(doc.splitTextToSize(content, 170), 20, 74);

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 160, margin: 1 });
  doc.addImage(qrDataUrl, 'PNG', 150, 25, 40, 40);

  return doc.output('datauristring');
};
