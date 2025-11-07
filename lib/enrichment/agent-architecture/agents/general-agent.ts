import { z } from 'zod';
import { BaseAgent } from '../core/agent-base';
import type { AgentResult } from '../core/types';
import { searchWeb } from '../tools/firecrawl-tools';

export class GeneralAgent extends BaseAgent {
  name = 'GeneralAgent';

  async execute(context: {
    email: string;
    emailContext: any;
    discoveredData: Record<string, any>;
    requestedFields: Array<{ name: string; description: string; type: string }>;
  }): Promise<AgentResult> {
    const { discoveredData, requestedFields } = context;
    const fields: Record<string, any> = {};
    const confidence: Record<string, number> = {};
    const sources: Record<string, string[]> = {};
    const errors: Record<string, string> = {};

    try {
      // Filter out fields already handled by specialized agents
      const specializedFields = new Set([
        'companyName', 'website', 'domain', 'companyType',
        'industry', 'headquarters', 'yearFounded', 'description', 'employeeCount',
        'fundingStage', 'totalRaised', 'lastRoundAmount', 'lastRoundDate', 'investors', 'valuation',
        'languages', 'frameworks', 'infrastructure', 'tools', 'techStack',
        'titleNormalized', 'seniority', 'department', 'linkedinUrl', 'location',
      ]);

      const customFields = requestedFields.filter(
        f => !specializedFields.has(f.name)
      );

      if (customFields.length === 0) {
        return { fields, confidence, sources, errors };
      }

      const companyName = discoveredData.companyName || discoveredData.companyNameGuess || '';
      const website = discoveredData.website || '';

      if (!companyName && !website) {
        return { fields, confidence, sources, errors };
      }

      // Build search queries for custom fields
      const searchQueries = customFields.map(f => 
        `${companyName} ${f.description || f.name}`
      );

      const searchResults: Array<{ url: string; title: string; description?: string; markdown?: string }> = [];
      for (const query of searchQueries) {
        try {
          const results = await searchWeb(query, this.firecrawlApiKey, {
            limit: 5,
            sources: [{ type: 'web' }],
            scrapeOptions: { formats: ['markdown'] },
          });
          searchResults.push(...results);
        } catch (error) {
          console.warn(`[GeneralAgent] Search failed for "${query}":`, error);
        }
      }

      // Build dynamic schema for custom fields
      const schemaFields: Record<string, z.ZodTypeAny> = {};
      for (const field of customFields) {
        switch (field.type) {
          case 'number':
            schemaFields[field.name] = z.number().nullable();
            break;
          case 'boolean':
            schemaFields[field.name] = z.boolean().nullable();
            break;
          case 'array':
            schemaFields[field.name] = z.array(z.string()).nullable();
            break;
          default:
            schemaFields[field.name] = z.string().nullable();
        }
      }

      const CustomFieldsSchema = z.object(schemaFields);

      // Prepare context for LLM
      const searchContext = searchResults
        .slice(0, 10)
        .map(r => `- ${r.title} (${r.url}): ${r.description || r.markdown?.substring(0, 300) || ''}`)
        .join('\n\n');

      const fieldDescriptions = customFields
        .map(f => `- ${f.name}: ${f.description || f.name} (type: ${f.type})`)
        .join('\n');

      const prompt = `You are a general-purpose data extraction specialist. Extract custom fields from the provided context.

Company name: ${companyName}
Website: ${website}

Search results:
${searchContext}

Extract the following custom fields:
${fieldDescriptions}

Return only confirmed information. If uncertain, omit the field.`;

      const result = await this.extractWithLLM(
        prompt,
        CustomFieldsSchema,
        `Extract custom fields for ${companyName || website}`
      );

      // Process results with confidence and sources
      for (const field of customFields) {
        const value = result[field.name];
        if (value !== undefined && value !== null) {
          fields[field.name] = value;
          confidence[field.name] = 0.7;
          sources[field.name] = searchResults.slice(0, 2).map(r => r.url);
        }
      }

    } catch (error) {
      errors['general'] = error instanceof Error ? error.message : 'Unknown error';
      console.error('[GeneralAgent] Error:', error);
    }

    return { fields, confidence, sources, errors };
  }
}

