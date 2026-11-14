import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { executeChatCompletion } from '../llm.js';
import { abortOnClientDisconnect, isAbortError } from '../requestAbort.js';

export const chatRouter = Router();

const chatSchema = z.object({
  // Clients may only send user/assistant turns; the system prompt is always server-controlled
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(20000)
    })
  )
    .min(1)
    .max(40, 'Conversation too long; start a new chat')
    .refine(msgs => msgs[msgs.length - 1].role === 'user', 'The last message must be from the user'),
  documentContext: z.string().max(100000).optional(),
  model: z.string().optional()
});

/**
 * Sanitizes external document context to neutralize prompt injection delimiter breakouts
 */
function sanitizeContext(rawContext: string): string {
  return rawContext
    .replace(/---+\s*(?:START|END|CURRENT)?\s*(?:DOCUMENT)?\s*CONTEXT\s*---+/gi, '[delimiter_neutralized]')
    .replace(/<\|im_start\|>|<\|im_end\|>/gi, '');
}

chatRouter.post('/', async (req: Request, res: Response) => {
  const signal = abortOnClientDisconnect(res);
  try {
    const { messages, documentContext, model } = chatSchema.parse(req.body);

    let systemPrompt = `You are ShivQuill AI, an intelligent, helpful, and articulate writing assistant and editor.
You assist writers with ideation, paragraph transitions, tone refinement, academic argumentation, and structural feedback.
Be concise, practical, and provide concrete examples when suggesting alternatives.`;

    if (documentContext && documentContext.trim().length > 0) {
      // Cap attached context so chat replies stay fast (very long contexts slow every turn)
      const sanitized = sanitizeContext(documentContext.trim().slice(0, 40000));
      systemPrompt += `\n\n=== ATTACHED DOCUMENT CONTEXT (Read-only reference for your suggestions) ===\n${sanitized}\n=== END ATTACHED DOCUMENT CONTEXT ===`;
    }

    // Keep the most recent turns within a total budget so requests stay fast and within context limits
    const MAX_HISTORY_CHARS = 30000;
    const conversation: typeof messages = [];
    let used = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      used += messages[i].content.length;
      if (used > MAX_HISTORY_CHARS && conversation.length > 0) break;
      conversation.unshift(messages[i]);
    }
    // Providers expect the first non-system turn to be from the user
    while (conversation.length > 1 && conversation[0].role !== 'user') conversation.shift();

    const reply = await executeChatCompletion(systemPrompt, conversation, model, 0.7, signal);

    return res.json({
      role: 'assistant',
      content: reply
    });
  } catch (error: any) {
    if (signal.aborted || isAbortError(error)) {
      return; // client disconnected; nothing to send
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Chat error:', error);
    return res.status(500).json({ error: error.message || 'Chat completion failed' });
  }
});
