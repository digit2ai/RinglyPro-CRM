import React from 'react'

type Props = React.PropsWithChildren<{
  fallback: React.ComponentType<FallbackProps>
  onError: (error: Error, info: React.ErrorInfo) => void
}>

type State = {
  error: Error | null
}

export type FallbackProps = {
  error: Error
  resetErrorBoundary: () => void
}

const initialState: State = {
  error: null,
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)

    const { fallback, onError } = props

    if (typeof fallback !== 'function') {
      throw new TypeError('Fallback must be a function')
    }

    if (typeof onError !== 'function') {
      throw new TypeError('onError must be a function')
    }

    this.state = initialState
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this)
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError(error, info)
  }

  resetErrorBoundary() {
    this.setState(initialState)
  }

  render() {
    const { error } = this.state

    if (error === null) {
      return this.props.children
    }

    return React.createElement(this.props.fallback, {
      error: error,
      resetErrorBoundary: this.resetErrorBoundary,
    })
  }
}
