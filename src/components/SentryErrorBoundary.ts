// SANITIZED: Sentry error boundary - disabled
import * as React from 'react'
interface Props { children: React.ReactNode }
interface State { hasError: boolean }

export class SentryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(): State { return { hasError: false }; }
  render(): React.ReactNode { return this.props.children; }
}
