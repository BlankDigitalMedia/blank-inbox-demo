import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { AgentResult } from './types';

/**
 * URL string schema that validates URLs but doesn't generate OpenAI-incompatible format field.
 * OpenAI's structured output API doesn't support 'uri' format, only 'uri-reference' or no format.
 * This uses a custom refinement to validate URLs without adding the format field.
 */
export const urlString = z.string().refine(
  (val) => {
    if (!val || val === '') return true; // Allow empty/nullable
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid URL' }
);

export interface AgentBase {
  name: string;
  execute(context: {
    email: string;
    emailContext: any;
    discoveredData: Record<string, any>;
    requestedFields: Array<{ name: string; description: string; type: string }>;
  }): Promise<AgentResult>;
}

export abstract class BaseAgent implements AgentBase {
  abstract name: string;
  protected openai: OpenAI;
  protected firecrawlApiKey: string;

  constructor(openaiApiKey: string, firecrawlApiKey: string) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.firecrawlApiKey = firecrawlApiKey;
  }

  abstract execute(context: {
    email: string;
    emailContext: any;
    discoveredData: Record<string, any>;
    requestedFields: Array<{ name: string; description: string; type: string }>;
  }): Promise<AgentResult>;

  protected async extractWithLLM(
    prompt: string,
    schema: z.ZodSchema,
    context: string,
    retries: number = 3
  ): Promise<z.infer<typeof schema>> {
    let lastError: Error | unknown;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const completion = await this.openai.chat.completions.parse({
          model: 'gpt-4o-2024-08-06',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: context },
          ],
          response_format: zodResponseFormat(schema, 'enrichment_result'),
        });

        const message = completion.choices[0]?.message;
        if (!message?.parsed) {
          throw new Error('No parsed content in LLM response');
        }

        return message.parsed as z.infer<typeof schema>;
      } catch (error) {
        lastError = error;
        
        // Don't retry on schema validation errors (400) - these are permanent
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status?: number }).status;
          if (status === 400) {
            console.error(`[${this.name}] LLM schema validation error (not retrying):`, error);
            throw error;
          }
        }
        
        // Retry with exponential backoff for transient errors
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s max
          console.warn(`[${this.name}] LLM extraction attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[${this.name}] LLM extraction failed after ${retries} attempts:`, error);
          throw error;
        }
      }
    }
    
    throw lastError || new Error('Unknown error in LLM extraction');
  }
}

