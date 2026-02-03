import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';

export function ErrorMessage({ error, retry }) {
  const message = error?.response?.data?.error?.message || error?.message || 'An error occurred';

  return (
    <Card className="border-danger">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-danger mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-danger">Error Loading Data</h3>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
            {retry && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={retry}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
