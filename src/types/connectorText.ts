export type ConnectorTextBlock = {
  type: 'connector_text'
  connector_text: string
  cache_control?: unknown
}

export type ConnectorTextDelta = {
  type: 'connector_text_delta'
  connector_text: string
}

export function isConnectorTextBlock(
  value: unknown,
): value is ConnectorTextBlock {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'connector_text' &&
    typeof (value as { connector_text?: unknown }).connector_text === 'string'
  )
}
