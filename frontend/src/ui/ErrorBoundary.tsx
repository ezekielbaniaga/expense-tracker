import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "./EmptyState";
import { PageHeading } from "./focus";

/**
 * Catches a render error in the page below it, so the header, nav and Sign out
 * stay. Key it by the location: a navigation then mounts a fresh boundary.
 * React has no hook for this, hence the class.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Page failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        title="Something went wrong"
        headline={<PageHeading className="empty-state__title">Something went wrong</PageHeading>}
        action={
          <Link className="btn btn--secondary btn--md" to="/">
            Back to expenses
          </Link>
        }
      >
        This page could not be shown.
      </EmptyState>
    );
  }
}
