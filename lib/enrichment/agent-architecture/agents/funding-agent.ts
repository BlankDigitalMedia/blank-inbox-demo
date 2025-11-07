import { z } from 'zod';
import { BaseAgent } from '../core/agent-base';
import type { AgentResult } from '../core/types';
import { searchWeb } from '../tools/firecrawl-tools';

const FundingResultSchema = z.object({
  fundingStage: z.enum(['seed', 'series-a', 'series-b', 'series-c', 'series-d', 'series-e', 'series-f', 'ipo', 'acquired', 'bootstrapped', 'unknown']).nullable(),
  totalRaised: z.string().nullable(),
  lastRoundAmount: z.string().nullable(),
  lastRoundDate: z.string().nullable(),
  investors: z.array(z.string()).nullable(),
  valuation: z.string().nullable(),
});

export type FundingResult = z.infer<typeof FundingResultSchema>;

export class FundingAgent extends BaseAgent {
  name = 'FundingAgent';

  async execute(context: {
    email: string;
    emailContext: any;
    discoveredData: Record<string, any>;
    requestedFields: Array<{ name: string; description: string; type: string }>;
  }): Promise<AgentResult> {
    const { discoveredData } = context;
    const fields: Record<string, any> = {};
    const confidence: Record<string, number> = {};
    const sources: Record<string, string[]> = {};
    const errors: Record<string, string> = {};

    try {
      const companyName = discoveredData.companyName || discoveredData.companyNameGuess || '';
      const industry = discoveredData.industry || '';
      
      if (!companyName) {
        return { fields, confidence, sources, errors };
      }

      // Search for funding information
      const searchQueries = [
        `${companyName} funding`,
        `${companyName} investors`,
        `${companyName} series A`,
        `${companyName} crunchbase`,
        `${companyName} raised`,
        `${companyName} valuation`,
      ];

      const searchResults: Array<{ url: string; title: string; description?: string; markdown?: string }> = [];
      for (const query of searchQueries) {
        try {
          const results = await searchWeb(query, this.firecrawlApiKey, {
            limit: 5,
            sources: [{ type: 'web' }, { type: 'news' }],
            scrapeOptions: { formats: ['markdown'] },
          });
          searchResults.push(...results);
        } catch (error) {
          console.warn(`[FundingAgent] Search failed for "${query}":`, error);
        }
      }

      // Prioritize Crunchbase, TechCrunch, news sources
      const prioritizedResults = [
        ...searchResults.filter(r => 
          r.url.includes('crunchbase') || 
          r.url.includes('techcrunch') ||
          r.url.includes('bloomberg') ||
          r.url.includes('reuters')
        ),
        ...searchResults.filter(r => 
          !r.url.includes('crunchbase') && 
          !r.url.includes('techcrunch') &&
          !r.url.includes('bloomberg') &&
          !r.url.includes('reuters')
        ),
      ].slice(0, 10);

      // Prepare context for LLM
      const searchContext = prioritizedResults
        .map(r => `- ${r.title} (${r.url}): ${r.description || r.markdown?.substring(0, 400) || ''}`)
        .join('\n\n');

      const prompt = `You are a funding intelligence specialist. Extract funding information from the provided context.

Company name: ${companyName}
${industry ? `Industry: ${industry}` : ''}

Search results:
${searchContext}

Extract:
- fundingStage: Current funding stage (seed, series-a, series-b, series-c, series-d, series-e, series-f, ipo, acquired, bootstrapped, unknown)
- totalRaised: Total funding raised to date (as string like "$10M", "$50M", "$1.2B")
- lastRoundAmount: Amount raised in most recent round (as string like "$5M", "$20M")
- lastRoundDate: Date of most recent funding round (as string like "2024-01-15" or "Q1 2024")
- investors: Array of investor names (firms or individuals, e.g., ["Sequoia Capital", "Andreessen Horowitz"])
- valuation: Current valuation if available (as string like "$100M", "$500M")

Return only confirmed information. If uncertain, omit the field.`;

      const result = await this.extractWithLLM(
        prompt,
        FundingResultSchema,
        `Extract funding information for ${companyName}`
      );

      // Process results with confidence and sources
      if (result.fundingStage) {
        fields['fundingStage'] = result.fundingStage;
        confidence['fundingStage'] = 0.85;
        sources['fundingStage'] = prioritizedResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('techcrunch'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.totalRaised) {
        fields['totalRaised'] = result.totalRaised;
        confidence['totalRaised'] = 0.85;
        sources['totalRaised'] = prioritizedResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('techcrunch'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.lastRoundAmount) {
        fields['lastRoundAmount'] = result.lastRoundAmount;
        confidence['lastRoundAmount'] = 0.8;
        sources['lastRoundAmount'] = prioritizedResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('techcrunch'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.lastRoundDate) {
        fields['lastRoundDate'] = result.lastRoundDate;
        confidence['lastRoundDate'] = 0.75;
        sources['lastRoundDate'] = prioritizedResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('techcrunch'))
          .slice(0, 1)
          .map(r => r.url);
      }

      if (result.investors && result.investors.length > 0) {
        fields['investors'] = result.investors;
        confidence['investors'] = 0.8;
        sources['investors'] = prioritizedResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('techcrunch'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.valuation) {
        fields['valuation'] = result.valuation;
        confidence['valuation'] = 0.7;
        sources['valuation'] = prioritizedResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('bloomberg'))
          .slice(0, 2)
          .map(r => r.url);
      }

    } catch (error) {
      errors['funding'] = error instanceof Error ? error.message : 'Unknown error';
      console.error('[FundingAgent] Error:', error);
    }

    return { fields, confidence, sources, errors };
  }
}

