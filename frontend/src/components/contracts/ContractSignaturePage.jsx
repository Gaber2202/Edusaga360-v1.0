import React, { useState, useEffect, useRef } from 'react';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { CheckCircle, XCircle, FileText, Loader2, PenLine } from 'lucide-react';
import { sanitizeHtml } from '../../lib/sanitize';
import { toast } from 'sonner';

// This is embedded in the parent-facing signing page (ParentSignContract)
export default function ContractSignaturePage({ contractId }) {
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [showSignBox, setShowSignBox] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (!contractId) return;
    supabase.StudentContract.get(contractId)
      .then(c => { setContract(c); setLoading(false); })
      .catch(() => setLoading(false));
  }, [contractId]);

  // Canvas signature drawing
  const startDraw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSign = async () => {
    if (!hasSignature || !agreementChecked) return;
    setSigning(true);
    try {
      const signedDate = new Date().toISOString();
      await tenantQuery('student_contracts').update({
        status: 'signed',
        signed_by_guardian: true,
        signed_date: signedDate,
        signature_ip: 'web',
        delivery_status: 'viewed'
      });

      // Create notification for HR/admin
      await tenantQuery('notifications').insert({
        tenant_id: contract.tenant_id,
        type: 'contract_signed',
        title_ar: `تم توقيع العقد - ${contract.student_name}`,
        title_en: `Contract Signed - ${contract.student_name}`,
        body_ar: `وقّع ولي الأمر ${contract.guardian_name} على عقد الطالب ${contract.student_name}`,
        body_en: `Guardian ${contract.guardian_name} signed the contract for student ${contract.student_name}`,
        reference_type: 'StudentContract',
        reference_id: contractId,
        is_read: false,
        recipient_role: 'admin',
        created_at: signedDate
      });

      setSigned(true);
      toast.success('Contract signed successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Error signing contract. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  const handleReject = async () => {
    setSigning(true);
    try {
      await tenantQuery('student_contracts').update({
        status: 'rejected',
        rejected_date: new Date().toISOString()
      });

      await tenantQuery('notifications').insert({
        tenant_id: contract.tenant_id,
        type: 'contract_rejected',
        title_ar: `رُفض العقد - ${contract.student_name}`,
        title_en: `Contract Rejected - ${contract.student_name}`,
        body_ar: `رفض ولي الأمر ${contract.guardian_name} التوقيع على عقد الطالب ${contract.student_name}`,
        body_en: `Guardian ${contract.guardian_name} rejected the contract for student ${contract.student_name}`,
        reference_type: 'StudentContract',
        reference_id: contractId,
        is_read: false,
        recipient_role: 'admin',
        created_at: new Date().toISOString()
      });

      setRejected(true);
    } catch {
      toast.error('Error. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
    </div>
  );

  if (!contract) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="p-8 text-center max-w-md">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Contract not found</h2>
      </Card>
    </div>
  );

  if (signed) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="p-10 text-center max-w-md">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-green-700 mb-2">تم التوقيع بنجاح / Signed Successfully</h2>
        <p className="text-slate-600">شكراً لك. تم استلام توقيعك وسيتم تأكيد التسجيل قريباً.</p>
        <p className="text-slate-500 text-sm mt-2">Thank you. Your signature has been recorded and enrollment will be confirmed shortly.</p>
      </Card>
    </div>
  );

  if (rejected) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="p-10 text-center max-w-md">
        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-600 mb-2">تم رفض العقد / Contract Rejected</h2>
        <p className="text-slate-600">سيتواصل معك فريق المدرسة قريباً.</p>
        <p className="text-slate-500 text-sm mt-2">The school team will contact you shortly.</p>
      </Card>
    </div>
  );

  if (contract.status === 'signed') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="p-10 text-center max-w-md">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-green-700">تم توقيع هذا العقد مسبقاً / Already Signed</h2>
        <p className="text-slate-500 text-sm mt-2">{contract.signed_date ? new Date(contract.signed_date).toLocaleString() : ''}</p>
      </Card>
    </div>
  );

  const contentAr = contract.generated_content_ar;
  const contentEn = contract.generated_content_en;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <FileText className="w-10 h-10 text-blue-600 mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-slate-900">
            {contract.student_name} — {contract.academic_year}
          </h1>
          <p className="text-slate-500 text-sm">
            {contract.guardian_name} | {contract.grade}
          </p>
        </div>

        {/* Contract Content */}
        <Card className="p-8 bg-white text-slate-900">
          {contentAr && (
            <div dir="rtl" className="mb-8" style={{ fontFamily: 'Arial, sans-serif' }}>
              <div
                className="prose prose-sm max-w-none"
                style={{ direction: 'rtl', textAlign: 'right' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentAr) }}
              />
            </div>
          )}
          {contentEn && contentAr && <hr className="my-8" />}
          {contentEn && (
            <div dir="ltr" style={{ fontFamily: 'Arial, sans-serif' }}>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentEn) }}
              />
            </div>
          )}
        </Card>

        {/* Signature Section */}
        <Card className="p-6 space-y-4">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <PenLine className="w-5 h-5" />
            التوقيع الإلكتروني / Electronic Signature
          </h3>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4"
              checked={agreementChecked}
              onChange={(e) => setAgreementChecked(e.target.checked)}
            />
            <span className="text-sm text-slate-700">
              أقر بأنني اطلعت على جميع بنود العقد وأوافق عليها / I confirm I have read and agree to all contract terms
            </span>
          </label>

          {!showSignBox ? (
            <Button
              onClick={() => setShowSignBox(true)}
              disabled={!agreementChecked}
              className="w-full"
            >
              <PenLine className="w-4 h-4 me-2" />
              وقّع هنا / Sign Here
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">ارسم توقيعك أدناه / Draw your signature below:</p>
              <canvas
                ref={canvasRef}
                width={600}
                height={150}
                className="border-2 border-dashed border-slate-300 rounded-lg w-full bg-white cursor-crosshair touch-none"
                style={{ maxHeight: '150px' }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearSignature}>
                  مسح / Clear
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSign}
              disabled={!hasSignature || !agreementChecked || signing}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {signing ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle className="w-4 h-4 me-2" />}
              توقيع وموافقة / Sign & Accept
            </Button>
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={signing}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 me-2" />
              رفض / Reject
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}