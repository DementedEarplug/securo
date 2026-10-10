import type { Agent, LlmConnection } from './types'

/** "Connection · model" answering for this agent, or null for the server default (as the web shows it). */
export function connectorLabel(agent: Agent, connections: LlmConnection[] | undefined): string | null {
  if (agent.connection_id) {
    const connection = connections?.find((c) => c.id === agent.connection_id)
    if (connection) {
      const model = agent.model || connection.default_model
      return model ? `${connection.name} · ${model}` : connection.name
    }
  }
  if (agent.provider) return agent.model ? `${agent.provider} · ${agent.model}` : agent.provider
  return null
}
