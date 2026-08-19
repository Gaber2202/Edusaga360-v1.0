import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export default function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-forest-700" aria-hidden />
      </CardContent>
    </Card>
  );
}
