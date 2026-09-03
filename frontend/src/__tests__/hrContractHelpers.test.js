import { describe, it, expect } from 'vitest';
import {
  resolveDocumentStatus,
  isExpiringSoon,
  normalizeUploadResult,
  buildDocumentPayload,
  buildEmployeeContractFromDocument,
  filterDocuments,
  documentTypeLabel,
} from '../lib/hrContractHelpers';

describe('resolveDocumentStatus', () => {
  it('returns expired when past expiry', () => {
    expect(
      resolveDocumentStatus(
        { status: 'sent', expiry_date: '2020-01-01' },
        new Date('2026-01-01'),
      ),
    ).toBe('expired');
  });

  it('keeps status when not expired', () => {
    expect(
      resolveDocumentStatus(
        { status: 'signed', expiry_date: '2030-01-01' },
        new Date('2026-01-01'),
      ),
    ).toBe('signed');
  });
});

describe('isExpiringSoon', () => {
  it('flags docs within window', () => {
    expect(
      isExpiringSoon(
        { expiry_date: '2026-01-15' },
        30,
        new Date('2026-01-01'),
      ),
    ).toBe(true);
    expect(
      isExpiringSoon(
        { expiry_date: '2026-06-01' },
        30,
        new Date('2026-01-01'),
      ),
    ).toBe(false);
  });
});

describe('normalizeUploadResult', () => {
  it('prefers path over signed URL', () => {
    expect(
      normalizeUploadResult({ path: 'tenant/a.pdf', signedUrl: 'https://x/tmp' }),
    ).toEqual({ file_path: 'tenant/a.pdf', document_url: 'tenant/a.pdf' });
  });
});

describe('buildDocumentPayload', () => {
  it('maps employee and branch', () => {
    const payload = buildDocumentPayload(
      {
        document_type: 'nda',
        employee_id: 'e1',
        document_name: 'NDA',
        document_url: 'path/nda.pdf',
        file_path: 'path/nda.pdf',
        requires_signature: true,
        status: 'draft',
      },
      {
        employee: { name_ar: 'أحمد', branch_id: 'b1' },
        selectedBranchId: 'b2',
      },
    );
    expect(payload.employee_name).toBe('أحمد');
    expect(payload.branch_id).toBe('b1');
    expect(payload.document_type).toBe('nda');
  });
});

describe('buildEmployeeContractFromDocument', () => {
  it('mirrors employment contract fields', () => {
    const row = buildEmployeeContractFromDocument(
      {
        employee_id: 'e1',
        branch_id: 'b1',
        document_type: 'employment_contract',
        issue_date: '2026-01-01',
        expiry_date: '2027-01-01',
        status: 'signed',
        contract_data: {
          contract_type: 'limited',
          basic_salary: 5000,
          total_salary: 7000,
          job_title: 'Teacher',
        },
      },
      { documentId: 'd1' },
    );
    expect(row.document_id).toBe('d1');
    expect(row.salary).toBe(7000);
    expect(row.status).toBe('active');
    expect(row.start_date).toBe('2026-01-01');
  });
});

describe('filterDocuments', () => {
  it('filters by search and status', () => {
    const docs = [
      { document_name: 'Contract A', employee_name: 'Ali', document_type: 'nda', status: 'draft' },
      { document_name: 'Offer', employee_name: 'Sara', document_type: 'offer_letter', status: 'sent' },
    ];
    expect(filterDocuments(docs, { search: 'ali' })).toHaveLength(1);
    expect(filterDocuments(docs, { status: 'sent' })).toHaveLength(1);
    expect(filterDocuments(docs, { type: 'nda' })).toHaveLength(1);
  });
});

describe('documentTypeLabel', () => {
  it('localizes', () => {
    expect(documentTypeLabel('employment_contract', false)).toBe('Employment Contract');
    expect(documentTypeLabel('employment_contract', true)).toBe('عقد توظيف');
  });
});
