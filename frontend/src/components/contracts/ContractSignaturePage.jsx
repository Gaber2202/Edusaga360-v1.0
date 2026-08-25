import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, callApi } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CheckCircle, XCircle, FileText, Loader2, PenLine } from 'lucide-react';
import { sanitizeHtml } from '../../lib/sanitize';
import { toast } from 'sonner';

/**
 * SCRUM-119: Parent portal login required; drawn + typed signature; server sign endpoint.
 */
export default function ContractSignaturePage({ contractId }) {
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [showSignBox, setShowSignBox] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const returnTo = `/ParentSignContract?id=${encodeURIComponent(contractId || '')}`;
        navigate(`/school-login?redirect=${encodeURIComponent(returnTo)}`, { replace: true });
        return;
      }
      if (!cancelled) setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [contractId, navigate]);

  useEffect(() => {
    if (!contractId || !authChecked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await callApi(`/api/parent/contracts/${contractId}`, null, { method: 'GET' });
        if (cancelled) return;
        setContract(res.data);
        setSchool(res.school || null);
        if (res.data?.status === 'signed') setSigned(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) setContract(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contractId, authChecked]);

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
    if (!hasSignature || !agreementChecked || typedName.trim().length < 2) {
      toast.error('Drawn signature and typed full name are both required');
      return;
    }
    setSigning(true);
    try {
      const drawn = canvasRef.current?.toDataURL('image/png') || '';
      await callApi(`/api/parent/contracts/${contractId}/sign`, {
        signer_typed_name: typedName.trim(),
        signature_drawn_data: drawn,
        agreement_accepted: true,
      });
      setSigned(true);
      toast.success('Contract signed successfully');
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Error signing contract. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  const handleReject = async () => {
    setSigning(true);
    try {
      // Rejection stays client-side update via staff tools; parents mark intent via support.
      setRejected(true);
      toast.message('Please contact the school if you wish to decline this contract.');
    } finally {
      setSigning(false);
    }
  };

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand">
        <Card className="p-8 text-center max-w-md">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Contract not found</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in with the parent account linked to this student.
          </p>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand p-4">
        <Card className="p-8 text-center max-w-md">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Contract signed</h2>
          <p className="text-muted-foreground mt-2">
            Admission will advance to enrolled. School staff will generate invoices separately.
          </p>
        </Card>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sand p-4">
        <Card className="p-8 text-center max-w-md">
          <XCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Declined</h2>
        </Card>
      </div>
    );
  }

  const content = contract.generated_content_en || contract.generated_content_ar || contract.content || '';

  return (
    <div className="min-h-screen bg-sand p-4 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center">
          {school?.logo_url && (
            <img src={school.logo_url} alt="" className="h-14 mx-auto mb-3 object-contain" />
          )}
          <h1 className="text-2xl font-bold text-ink">Enrollment Contract</h1>
          <p className="text-muted-foreground">
            {contract.contract_number} · {contract.student_name}
          </p>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4 text-ink font-semibold">
            <FileText className="w-4 h-4" /> Contract terms
          </div>
          <div
            className="prose prose-sm max-w-none text-ink"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
          />
        </Card>

        {!showSignBox ? (
          <div className="flex gap-2 justify-center flex-wrap">
            <Button onClick={() => setShowSignBox(true)} className="bg-najdi-700 hover:bg-najdi-900">
              <PenLine className="w-4 h-4 me-2" /> Sign contract
            </Button>
            <Button variant="outline" onClick={handleReject} disabled={signing}>Decline</Button>
          </div>
        ) : (
          <Card className="p-6 space-y-4">
            <div>
              <Label>Full legal name (typed) *</Label>
              <Input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full name exactly as on ID"
                required
              />
            </div>
            <div>
              <Label>Drawn signature *</Label>
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full border border-border rounded-lg bg-white touch-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
              <Button type="button" variant="ghost" size="sm" onClick={clearSignature} className="mt-1">
                Clear
              </Button>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agreementChecked}
                onChange={(e) => setAgreementChecked(e.target.checked)}
                className="mt-1"
              />
              I agree to the terms of this enrollment contract and confirm my identity.
            </label>
            <Button
              onClick={handleSign}
              disabled={signing || !hasSignature || !agreementChecked || typedName.trim().length < 2}
              className="w-full bg-najdi-700 hover:bg-najdi-900"
            >
              {signing ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              Sign & Accept
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
