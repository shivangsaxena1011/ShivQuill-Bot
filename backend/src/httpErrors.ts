import { ProviderError, ModelNotAllowedError } from './llm.js';

/**
 * Maps an unexpected route error to a client-safe status and message.
 * Provider errors can embed upstream details (organization ids, rate-limit figures, configuration
 * hints), so those are logged server-side and replaced by a generic message.
 */
export function toClientError(error: unknown, fallbackMessage: string): { status: number; message: string } {
  if (error instanceof ModelNotAllowedError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof ProviderError) {
    if (error.status === 429) {
      return { status: 429, message: 'The AI provider is busy right now. Please wait a moment and try again.' };
    }
    return { status: 502, message: error.clientMessage || 'The AI provider could not complete this request. Please try again.' };
  }
  return { status: 500, message: fallbackMessage };
}
