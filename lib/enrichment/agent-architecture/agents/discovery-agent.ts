import { z } from 'zod';
import { BaseAgent, urlString } from '../core/agent-base';
import type { AgentResult, EmailContext } from '../core/types';
import { scrapeWebsite, searchWeb, mapWebsite } from '../tools/firecrawl-tools';

const DiscoveryResultSchema = z.object({
  companyName: z.string().nullable(),
  website: urlString.nullable(),
  domain: z.string().nullable(),
  companyType: z.enum(['startup', 'enterprise', 'sme', 'nonprofit', 'unknown']).nullable(),
});

export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

export class DiscoveryAgent extends BaseAgent {
  name = 'DiscoveryAgent';

  async execute(context: {
    email: string;
    emailContext: EmailContext;
    discoveredData: Record<string, any>;
    requestedFields: Array<{ name: string; description: string; type: string }>;
  }): Promise<AgentResult> {
    const { emailContext } = context;
    const fields: Record<string, any> = {};
    const confidence: Record<string, number> = {};
    const sources: Record<string, string[]> = {};
    const errors: Record<string, string> = {};

    try {
      // Skip personal emails
      if (emailContext.isPersonalEmail) {
        return { fields, confidence, sources, errors };
      }

      const domain = emailContext.domain;
      const companyNameGuess = emailContext.companyNameGuess || domain.split('.')[0];
      
      // Build website URL
      const website = emailContext.companyDomain 
        ? `https://${emailContext.companyDomain}`
        : `https://${domain}`;

      // Scrape homepage
      let homepageContent = '';
      let homepageUrl = '';
      try {
        const scraped = await scrapeWebsite(website, this.firecrawlApiKey);
        homepageContent = scraped.markdown || scraped.html || '';
        homepageUrl = website;
        sources['website'] = [homepageUrl];
      } catch (error) {
        console.warn(`[DiscoveryAgent] Failed to scrape ${website}:`, error);
      }

      // Search for company information
      const searchQueries = [
        `${companyNameGuess} company`,
        `${companyNameGuess} official website`,
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
          console.warn(`[DiscoveryAgent] Search failed for "${query}":`, error);
        }
      }

      // Map website to discover key pages
      let mapLinks: Array<{ url: string; title?: string }> = [];
      try {
        const mapResult = await mapWebsite(website, this.firecrawlApiKey, {
          limit: 20,
        });
        mapLinks = mapResult.links || [];
      } catch (error) {
        console.warn(`[DiscoveryAgent] Map failed for ${website}:`, error);
      }

      // Prepare context for LLM
      const searchContext = searchResults
        .slice(0, 5)
        .map(r => `- ${r.title} (${r.url}): ${r.description || r.markdown?.substring(0, 200) || ''}`)
        .join('\n');

      const mapContext = mapLinks
        .slice(0, 10)
        .map(l => `- ${l.title || l.url}: ${l.url}`)
        .join('\n');

      const prompt = `You are a company discovery specialist. Extract basic company information from the provided context.

Email domain: ${domain}
Company name guess: ${companyNameGuess}
Website: ${website}

Homepage content (first 2000 chars):
${homepageContent.substring(0, 2000)}

Search results:
${searchContext}

Website structure:
${mapContext}

Extract:
- companyName: Official company name (e.g., "Acme Corp" not "acme.com")
- website: Official website URL (canonical, with https://)
- domain: Primary domain (e.g., "acme.com")
- companyType: One of: startup, enterprise, sme, nonprofit, unknown

Return only confirmed information. If uncertain, omit the field.`;

      const result = await this.extractWithLLM(
        prompt,
        DiscoveryResultSchema,
        `Extract company discovery data for ${emailContext.email}`
      );

      // Process results
      if (result.companyName) {
        fields['companyName'] = result.companyName;
        confidence['companyName'] = homepageContent.length > 0 ? 0.9 : 0.7;
        sources['companyName'] = homepageUrl ? [homepageUrl] : [];
      }

      if (result.website) {
        fields['website'] = result.website;
        confidence['website'] = 0.95;
        sources['website'] = [result.website];
      }

      if (result.domain) {
        fields['domain'] = result.domain;
        confidence['domain'] = 0.95;
        sources['domain'] = [];
      }

      if (result.companyType) {
        fields['companyType'] = result.companyType;
        confidence['companyType'] = 0.7;
        sources['companyType'] = searchResults.slice(0, 3).map(r => r.url);
      }

      // Add website URL if not already set
      if (!fields['website'] && homepageUrl) {
        fields['website'] = homepageUrl;
        confidence['website'] = 0.85;
        sources['website'] = [homepageUrl];
      }

    } catch (error) {
      errors['discovery'] = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DiscoveryAgent] Error:', error);
    }

    return { fields, confidence, sources, errors };
  }
}

