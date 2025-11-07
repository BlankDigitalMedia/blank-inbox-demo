import { SimpleEnrichmentOrchestrator } from '../agent-architecture';
import type { EnrichmentField, EnrichmentResult } from '../agent-architecture/core/types';
import { shouldSkipEmail, loadSkipList } from '../utils/skip-list';

export class AgentEnrichmentStrategy {
  private orchestrator: SimpleEnrichmentOrchestrator;
  
  constructor(openaiApiKey: string, firecrawlApiKey: string) {
    this.orchestrator = new SimpleEnrichmentOrchestrator(openaiApiKey, firecrawlApiKey);
  }
  
  async enrichEmail(
    email: string,
    fields: EnrichmentField[] = []
  ): Promise<{ enrichments: Record<string, EnrichmentResult>; status: 'completed' | 'skipped' | 'error'; error?: string }> {
    try {
      // Check skip list
      const skipList = await loadSkipList();
      if (shouldSkipEmail(email, skipList)) {
        return {
          enrichments: {},
          status: 'skipped',
          error: 'Email domain is in skip list',
        };
      }

      const enrichments = await this.orchestrator.enrichEmail(email, fields);
      
      // Validate enrichment results before returning
      const validatedEnrichments: Record<string, EnrichmentResult> = {};
      for (const [fieldName, result] of Object.entries(enrichments)) {
        // Basic validation: ensure value is not undefined and confidence is valid
        if (result && typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1) {
          validatedEnrichments[fieldName] = result;
        } else {
          console.warn(`[AgentEnrichmentStrategy] Invalid enrichment result for field ${fieldName}, skipping`);
        }
      }
      
      return {
        enrichments: validatedEnrichments,
        status: 'completed',
      };
    } catch (error) {
      console.error('[AgentEnrichmentStrategy] Enrichment error:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check for OpenAI API errors
        if ('status' in error) {
          const status = (error as { status?: number }).status;
          if (status === 400) {
            errorMessage = 'Invalid request to enrichment service';
          } else if (status === 429) {
            errorMessage = 'Rate limit exceeded. Please try again later.';
          } else if (status === 500 || status === 502 || status === 503) {
            errorMessage = 'Enrichment service temporarily unavailable. Please try again later.';
          }
        }
      }
      
      return {
        enrichments: {},
        status: 'error',
        error: errorMessage,
      };
    }
  }
}

