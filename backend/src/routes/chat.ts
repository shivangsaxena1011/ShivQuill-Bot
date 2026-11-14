import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { executeLlmCompletion } from '../llm.js';

export const chatRouter = Router();

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1)
    })
  ).min(1),
  documentContext: z.string().max(20000).optional(),
  model: z.string().optional()
});

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { messages, documentContext, model } = chatSchema.parse(req.body);

    let systemPrompt = `You are QuillFlow AI, an intelligent, helpful, and articulate writing assistant.
You help writers brainstorm, outline, rewrite, critique, and refine documents.
Always be concise, precise, and practical in your suggestions.`;

    if (documentContext && documentContext.trim().length > 0) {
      systemPrompt += `\n\n--- CURRENT DOCUMENT CONTEXT ---\n${documentContext.trim()}\n--- END CONTEXT ---`;
    }

    const lastUserMessage = messages[messages.length - 1].content;
    const conversationHistory = messages.slice(0, -1).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
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
