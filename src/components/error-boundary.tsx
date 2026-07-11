"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Delta ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-lg">
            <div className="mb-4 text-4xl" aria-hidden>!</div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              Произошла ошибка
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {this.state.error?.message || "Неизвестная ошибка"}
            </p>
            <button
              onClick={this.handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Попробовать снова
            </button>
            <button
              onClick={() => window.location.reload()}
              className="ml-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
