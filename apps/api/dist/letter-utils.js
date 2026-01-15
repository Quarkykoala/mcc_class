"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVerificationResponse = exports.generateIssuancePdf = exports.buildContentHash = exports.normalizeTagIds = void 0;
const jspdf_1 = require("jspdf");
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
const normalizeTagIds = (tagIds) => {
    if (!Array.isArray(tagIds))
        return [];
    const cleaned = tagIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
    return Array.from(new Set(cleaned)).sort();
};
exports.normalizeTagIds = normalizeTagIds;
const buildContentHash = ({ letterId, versionNumber, context, departmentId, tagIds, content }) => {
    const payload = {
        letter_id: letterId,
        version: versionNumber,
        context,
        department_id: departmentId,
        tag_ids: tagIds,
        content
    };
    return crypto_1.default.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};
exports.buildContentHash = buildContentHash;
const generateIssuancePdf = async ({ context, departmentName, content, contentHash, verificationUrl, issuedAt }) => {
    const doc = new jspdf_1.jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text(context === 'COMPANY' ? 'MCC COMPANY OPS' : 'BCBA ASSOCIATION', 20, 30);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(`Department: ${departmentName}`, 20, 40);
    doc.text(`Date: ${(issuedAt ?? new Date()).toLocaleDateString()}`, 20, 45);
    doc.setDrawColor(200);
    doc.line(20, 50, 190, 50);
    doc.setFontSize(12);
    doc.setTextColor(0);
    const splitText = doc.splitTextToSize(content, 170);
    doc.text(splitText, 20, 70);
    const qrDataUrl = await qrcode_1.default.toDataURL(verificationUrl);
    doc.addImage(qrDataUrl, 'PNG', 150, 240, 40, 40);
    doc.setFontSize(8);
    doc.text('Scan to Verify Authenticity', 153, 282);
    doc.text(`Hash: ${contentHash.substring(0, 16)}...`, 20, 282);
    return doc.output('datauristring');
};
exports.generateIssuancePdf = generateIssuancePdf;
const buildVerificationResponse = (version) => {
    const letterStatus = version.letters?.status;
    const issuanceExists = (version.issuances || []).length > 0;
    let validity = 'invalid';
    if (letterStatus === 'REVOKED') {
        validity = 'revoked';
    }
    else if (letterStatus === 'APPROVED' || letterStatus === 'ISSUED') {
        validity = 'valid';
    }
    const approvalCandidates = [
        ...(version.approvals || []),
        ...(version.committee_approvals || [])
    ];
    const approval = approvalCandidates.sort((a, b) => {
        const aTime = a.approved_at ? Date.parse(a.approved_at) : 0;
        const bTime = b.approved_at ? Date.parse(b.approved_at) : 0;
        return bTime - aTime;
    })[0];
    const approvedVia = approval && 'committee_id' in approval ? 'COMMITTEE' : approval ? 'APPROVER' : null;
    const committeeId = approval && 'committee_id' in approval ? approval.committee_id ?? null : null;
    return {
        valid: validity === 'valid',
        status: validity,
        document_details: {
            context: version.letters?.context,
            department: version.letters?.departments?.name,
            version: version.version_number,
            status: letterStatus,
            approved_at: approval?.approved_at || null,
            approved_by: approval?.approver_id || null,
            approved_via: approvedVia,
            committee_id: committeeId,
            issuance_exists: issuanceExists
        }
    };
};
exports.buildVerificationResponse = buildVerificationResponse;
