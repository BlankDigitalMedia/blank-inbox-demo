import { z } from 'zod';
import { BaseAgent } from '../core/agent-base';
import type { AgentResult } from '../core/types';
import { searchWeb, scrapeWebsite, crawlWebsite } from '../tools/firecrawl-tools';

const CompanyProfileResultSchema = z.object({
  industry: z.string().nullable(),
  headquarters: z.string().nullable(),
  yearFounded: z.number().nullable(),
  description: z.string().nullable(),
  employeeCount: z.string().nullable(),
  companyType: z.enum(['startup', 'enterprise', 'sme', 'nonprofit', 'unknown']).nullable(),
});

export type CompanyProfileResult = z.infer<typeof CompanyProfileResultSchema>;

export class CompanyProfileAgent extends BaseAgent {
  name = 'CompanyProfileAgent';

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
      const website = discoveredData.website || '';
      
      if (!companyName && !website) {
        return { fields, confidence, sources, errors };
      }

      // Search for company profile information
      const searchQueries = [
        `${companyName} industry`,
        `${companyName} headquarters location`,
        `${companyName} founded year`,
        `${companyName} about company`,
        `${companyName} employees`,
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
          console.warn(`[CompanyProfileAgent] Search failed for "${query}":`, error);
        }
      }

      // Scrape about/careers pages if website available
      let aboutContent = '';
      let aboutUrl = '';
      if (website) {
        const aboutUrls = [
          `${website}/about`,
          `${website}/company`,
          `${website}/careers`,
          `${website}/team`,
        ];

        for (const url of aboutUrls) {
          try {
            const scraped = await scrapeWebsite(url, this.firecrawlApiKey);
            if (scraped.markdown || scraped.html) {
              aboutContent = scraped.markdown || scraped.html || '';
              aboutUrl = url;
              break;
            }
          } catch (error) {
            // Continue to next URL
          }
        }

        // If no about page found, try crawling homepage for about section
        if (!aboutContent) {
          try {
            const crawlResult = await crawlWebsite(website, this.firecrawlApiKey, {
              limit: 10,
              maxDepth: 1,
              includePaths: ['/about/*', '/company/*', '/careers/*'],
              scrapeOptions: { formats: ['markdown'] },
            });
            if (crawlResult.data.length > 0) {
              aboutContent = crawlResult.data
                .map(p => p.markdown || p.html || '')
                .join('\n\n')
                .substring(0, 3000);
              aboutUrl = website;
            }
          } catch (error) {
            console.warn(`[CompanyProfileAgent] Crawl failed for ${website}:`, error);
          }
        }
      }

      // Prepare context for LLM
      const searchContext = searchResults
        .slice(0, 8)
        .map(r => `- ${r.title} (${r.url}): ${r.description || r.markdown?.substring(0, 300) || ''}`)
        .join('\n\n');

      const prompt = `You are a company profile specialist. Extract company profile information from the provided context.

Company name: ${companyName}
Website: ${website}

About page content (first 3000 chars):
${aboutContent.substring(0, 3000)}

Search results:
${searchContext}

Extract:
- industry: Primary industry or sector (e.g., "SaaS", "Healthcare Technology", "E-commerce")
- headquarters: Headquarters location (city, state/country format)
- yearFounded: Year the company was founded (as a number, e.g., 2020)
- description: Brief company description (1-2 sentences)
- employeeCount: Approximate employee count (as string like "50-100", "1000+", "100-500")
- companyType: One of: startup, enterprise, sme, nonprofit, unknown

Return only confirmed information. If uncertain, omit the field.`;

      const result = await this.extractWithLLM(
        prompt,
        CompanyProfileResultSchema,
        `Extract company profile for ${companyName || website}`
      );

      // Process results with confidence and sources
      if (result.industry) {
        fields['industry'] = result.industry;
        confidence['industry'] = aboutContent.length > 0 ? 0.85 : 0.7;
        sources['industry'] = aboutUrl ? [aboutUrl] : searchResults.slice(0, 2).map(r => r.url);
      }

      if (result.headquarters) {
        fields['headquarters'] = result.headquarters;
        confidence['headquarters'] = 0.8;
        sources['headquarters'] = searchResults
          .filter(r => r.url.includes('linkedin') || r.url.includes('crunchbase') || r.url.includes('about'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.yearFounded) {
        fields['yearFounded'] = result.yearFounded;
        confidence['yearFounded'] = 0.85;
        sources['yearFounded'] = searchResults
          .filter(r => r.url.includes('crunchbase') || r.url.includes('wikipedia') || r.url.includes('about'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.description) {
        fields['description'] = result.description;
        confidence['description'] = aboutContent.length > 0 ? 0.9 : 0.75;
        sources['description'] = aboutUrl ? [aboutUrl] : searchResults.slice(0, 1).map(r => r.url);
      }

      if (result.employeeCount) {
        fields['employeeCount'] = result.employeeCount;
        confidence['employeeCount'] = 0.7;
        sources['employeeCount'] = searchResults
          .filter(r => r.url.includes('linkedin') || r.url.includes('crunchbase'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.companyType) {
        fields['companyType'] = result.companyType;
        confidence['companyType'] = 0.75;
        sources['companyType'] = searchResults.slice(0, 2).map(r => r.url);
      }

    } catch (error) {
      errors['companyProfile'] = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CompanyProfileAgent] Error:', error);
    }

    return { fields, confidence, sources, errors };
  }
}

