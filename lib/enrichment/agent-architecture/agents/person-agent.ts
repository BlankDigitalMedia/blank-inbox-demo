import { z } from 'zod';
import { BaseAgent, urlString } from '../core/agent-base';
import type { AgentResult, EmailContext } from '../core/types';
import { searchWeb } from '../tools/firecrawl-tools';

const PersonResultSchema = z.object({
  titleNormalized: z.string().nullable(),
  seniority: z.enum(['executive', 'director', 'senior', 'mid', 'junior', 'founder', 'unknown']).nullable(),
  department: z.string().nullable(),
  linkedinUrl: urlString.nullable(),
  location: z.string().nullable(),
});

export type PersonResult = z.infer<typeof PersonResultSchema>;

export class PersonAgent extends BaseAgent {
  name = 'PersonAgent';

  async execute(context: {
    email: string;
    emailContext: EmailContext;
    discoveredData: Record<string, any>;
    requestedFields: Array<{ name: string; description: string; type: string }>;
  }): Promise<AgentResult> {
    const { email, emailContext, discoveredData } = context;
    const fields: Record<string, any> = {};
    const confidence: Record<string, number> = {};
    const sources: Record<string, string[]> = {};
    const errors: Record<string, string> = {};

    try {
      // Extract name from email or context
      const emailLocalPart = email.split('@')[0] || '';
      const personalName = emailContext.personalName || emailLocalPart;
      const companyName = discoveredData.companyName || discoveredData.companyNameGuess || '';

      if (!personalName || !companyName) {
        return { fields, confidence, sources, errors };
      }

      // Search for person information
      const searchQueries = [
        `${personalName} ${companyName}`,
        `${personalName} ${companyName} linkedin`,
        `${email} ${companyName}`,
        `"${personalName}" "${companyName}" title`,
      ];

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
          console.warn(`[PersonAgent] Search failed for "${query}":`, error);
        }
      }

      // Filter out LinkedIn direct links (often blocked, but metadata may be available)
      const filteredResults = searchResults.filter(r => {
        // Skip direct LinkedIn profile scraping but keep search results about the person
        if (r.url.includes('linkedin.com/in/')) {
          // Keep metadata but note we can't scrape directly
          return true;
        }
        return true;
      });

      // Prepare context for LLM
      const searchContext = filteredResults
        .slice(0, 8)
        .map(r => {
          const isLinkedIn = r.url.includes('linkedin.com');
          return `- ${r.title} (${r.url}): ${isLinkedIn ? '[LinkedIn Profile - metadata only]' : (r.description || r.markdown?.substring(0, 300) || '')}`;
        })
        .join('\n\n');

      const prompt = `You are a person profile specialist. Extract person information from the provided context.

Email: ${email}
Name: ${personalName}
Company: ${companyName}

Search results:
${searchContext}

Extract:
- titleNormalized: Normalized job title (e.g., "Software Engineer", "VP of Engineering", "CEO", "Product Manager")
- seniority: Seniority level (executive, director, senior, mid, junior, founder, unknown)
- department: Department or team (e.g., "Engineering", "Product", "Sales", "Marketing")
- linkedinUrl: LinkedIn profile URL if found (full URL)
- location: Location (city, state/country format)

Return only confirmed information. If uncertain, omit the field.
Note: LinkedIn profiles often require authentication, so extract what's available from search metadata.`;

      const result = await this.extractWithLLM(
        prompt,
        PersonResultSchema,
        `Extract person profile for ${personalName} at ${companyName}`
      );

      // Process results with confidence and sources
      if (result.titleNormalized) {
        fields['titleNormalized'] = result.titleNormalized;
        confidence['titleNormalized'] = filteredResults.some(r => r.url.includes('linkedin')) ? 0.85 : 0.7;
        sources['titleNormalized'] = filteredResults
          .filter(r => r.url.includes('linkedin') || r.title.toLowerCase().includes('title'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.seniority) {
        fields['seniority'] = result.seniority;
        confidence['seniority'] = 0.75;
        sources['seniority'] = filteredResults
          .filter(r => r.url.includes('linkedin') || r.title.toLowerCase().includes('profile'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.department) {
        fields['department'] = result.department;
        confidence['department'] = 0.7;
        sources['department'] = filteredResults.slice(0, 2).map(r => r.url);
      }

      if (result.linkedinUrl) {
        fields['linkedinUrl'] = result.linkedinUrl;
        confidence['linkedinUrl'] = filteredResults.some(r => r.url.includes('linkedin.com')) ? 0.9 : 0.6;
        sources['linkedinUrl'] = filteredResults
          .filter(r => r.url.includes('linkedin.com'))
          .slice(0, 1)
          .map(r => r.url);
      }

      if (result.location) {
        fields['location'] = result.location;
        confidence['location'] = 0.7;
        sources['location'] = filteredResults
          .filter(r => r.url.includes('linkedin') || r.title.toLowerCase().includes('location'))
          .slice(0, 2)
          .map(r => r.url);
      }

    } catch (error) {
      errors['person'] = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PersonAgent] Error:', error);
    }

    return { fields, confidence, sources, errors };
  }
}

