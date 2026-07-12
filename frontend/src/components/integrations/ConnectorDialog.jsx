import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import ProviderFields from './ProviderFields';
import { splitProviderPayload } from '../../api/integrations';

/**
 * Shared "add connector" dialog for the ATS and Email tabs. Picks a provider,
 * renders its fields dynamically, and submits { provider, display_name, config,
 * credentials }. `onCreate` runs the mutation; the parent closes on success.
 */
export default function ConnectorDialog({ open, onClose, providers = [], onCreate, creating, title, showCapabilities }) {
  const [providerId, setProviderId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [values, setValues] = useState({});

  // Reset the form each time the dialog is opened.
  useEffect(() => {
    if (open) {
      setProviderId('');
      setDisplayName('');
      setValues({});
    }
  }, [open]);

  const provider = providers.find((p) => p.id === providerId);

  const submit = () => {
    if (!provider) return toast.error('Select a provider');
    if (!displayName.trim()) return toast.error('Enter a name');
    let payload;
    try {
      const { credentials, config } = splitProviderPayload(provider, values);
      payload = { provider: providerId, display_name: displayName.trim(), config, credentials };
    } catch {
      return toast.error('Field mapping must be valid JSON');
    }
    onCreate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showCapabilities && provider && (
              <div className="flex gap-2 mt-2">
                {provider.capabilities?.send && <Badge className="bg-emerald-50 text-emerald-700">Send</Badge>}
                {provider.capabilities?.receive && <Badge className="bg-najdi-50 text-najdi-700">Receive</Badge>}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Greenhouse (Hiring)" />
          </div>

          {provider && <ProviderFields provider={provider} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={submit} disabled={creating || !provider}>
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
