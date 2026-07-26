import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

function isChunkLoadError(error) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : String(error);
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes('Unable to preload CSS')
  );
}

export class ChunkLoadErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ChunkLoadErrorBoundary caught error:', error, errorInfo);
  }

  handleReload = () => {
    // Force a fresh load without cache so stale chunk filenames are re-resolved.
    window.location.reload(true);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isChunk = isChunkLoadError(this.state.error);
    const title = isChunk ? 'Page load failed' : 'Something went wrong';
    const message = isChunk
      ? 'A required part of the app could not be loaded. This usually happens after a new deployment. Please reload to fetch the latest version.'
      : 'An unexpected error occurred. Please reload the page.';

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            <p className="text-muted-foreground mt-2">{message}</p>
          </div>
          <Button onClick={this.handleReload} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}

export default ChunkLoadErrorBoundary;
