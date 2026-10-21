import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  requestId: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      requestId: Math.random().toString(36).substring(2, 9).toUpperCase(),
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      requestId: Math.random().toString(36).substring(2, 9).toUpperCase(),
    });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
          <ErrorState
            title="Something unexpected happened"
            message="An unexpected client rendering error occurred. You can reload this view or return safely to the home dashboard."
            error={this.state.error}
            requestId={this.state.requestId}
            onRetry={this.handleRetry}
            onSecondaryAction={() => {
              window.location.href = '/home';
            }}
            secondaryActionLabel="Go to Home"
          />
        </div>
      );
    }

    return this.props.children;
  }
}
