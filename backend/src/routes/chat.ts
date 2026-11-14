import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { executeLlmCompletion } from '../llm.js';

export const chatRouter = Router();

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(50000)
    })
  ).min(1),
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
  try {
    const { messages, documentContext, model } = chatSchema.parse(req.body);

    let systemPrompt = `You are ShivQuill AI, an intelligent, helpful, and articulate writing assistant and editor.
You assist writers with ideation, paragraph transitions, tone refinement, academic argumentation, and structural feedback.
Be concise, practical, and provide concrete examples when suggesting alternatives.`;

    if (documentContext && documentContext.trim().length > 0) {
      const sanitized = sanitizeContext(documentContext.trim());
      systemPrompt += `\n\n=== ATTACHED DOCUMENT CONTEXT (Read-only reference for your suggestions) ===\n${sanitized}\n=== END ATTACHED DOCUMENT CONTEXT ===`;
    }

    const lastUserMessage = messages[messages.length - 1].content;
    const conversationHistory = messages
      .slice(0, -1)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const userPrompt = conversationHistory ? `${conversationHistory}\n\nUSER: ${lastUserMessage}` : lastUserMessage;

    const reply = await executeLlmCompletion(systemPrompt, userPrompt, model, 0.7);

    return res.json({
      role: 'assistant',
      content: reply
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Chat error:', error);
    return res.status(500).json({ error: error.message || 'Chat completion failed' });
  }
});
