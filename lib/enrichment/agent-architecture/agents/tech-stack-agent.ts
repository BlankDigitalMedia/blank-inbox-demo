import { z } from 'zod';
import { BaseAgent } from '../core/agent-base';
import type { AgentResult } from '../core/types';
import { scrapeWebsite, searchWeb, crawlWebsite } from '../tools/firecrawl-tools';

const TechStackResultSchema = z.object({
  languages: z.array(z.string()).nullable(),
  frameworks: z.array(z.string()).nullable(),
  infrastructure: z.array(z.string()).nullable(),
  tools: z.array(z.string()).nullable(),
  techStack: z.array(z.string()).nullable(), // Combined for convenience
});

export type TechStackResult = z.infer<typeof TechStackResultSchema>;

export class TechStackAgent extends BaseAgent {
  name = 'TechStackAgent';

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

      // Search for tech stack information
      const searchQueries = [
        `${companyName} tech stack`,
        `${companyName} technology`,
        `${companyName} built with`,
        `${companyName} github`,
        `${companyName} stackshare`,
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
          console.warn(`[TechStackAgent] Search failed for "${query}":`, error);
        }
      }

      // Scrape website for tech stack clues (HTML, GitHub links, job postings)
      let websiteContent = '';
      let websiteUrl = '';
      if (website) {
        try {
          const scraped = await scrapeWebsite(website, this.firecrawlApiKey);
          websiteContent = scraped.html || scraped.markdown || '';
          websiteUrl = website;
        } catch (error) {
          console.warn(`[TechStackAgent] Failed to scrape ${website}:`, error);
        }

        // Try crawling careers/jobs page for tech stack mentions
        try {
          const crawlResult = await crawlWebsite(website, this.firecrawlApiKey, {
            limit: 5,
            maxDepth: 1,
            includePaths: ['/careers/*', '/jobs/*', '/team/*'],
            scrapeOptions: { formats: ['markdown'] },
          });
          if (crawlResult.data.length > 0) {
            const careersContent = crawlResult.data
              .map(p => p.markdown || p.html || '')
              .join('\n\n');
            websiteContent += '\n\n' + careersContent;
          }
        } catch (error) {
          // Continue without careers content
        }
      }

      // Extract HTML tech stack clues
      const techStackClues: string[] = [];
      if (websiteContent) {
        // Look for common tech stack indicators in HTML
        const techPatterns = [
          /React|Angular|Vue|Svelte/i,
          /Node\.js|Python|Java|Go|Rust|Ruby/i,
          /AWS|GCP|Azure|Vercel|Netlify/i,
          /PostgreSQL|MySQL|MongoDB|Redis/i,
          /Docker|Kubernetes|Terraform/i,
          /GitHub|GitLab|Bitbucket/i,
        ];
        
        for (const pattern of techPatterns) {
          if (pattern.test(websiteContent)) {
            const matches = websiteContent.match(pattern);
            if (matches) {
              techStackClues.push(...matches);
            }
          }
        }
      }

      // Prepare context for LLM
      const searchContext = searchResults
        .slice(0, 8)
        .map(r => `- ${r.title} (${r.url}): ${r.description || r.markdown?.substring(0, 300) || ''}`)
        .join('\n\n');

      const htmlClues = websiteContent
        .substring(0, 2000)
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

      const prompt = `You are a tech stack analyst. Extract technology stack information from the provided context.

Company name: ${companyName}
Website: ${website}

Website content (first 2000 chars, HTML clues):
${htmlClues.substring(0, 2000)}

Tech stack clues from HTML: ${techStackClues.join(', ')}

Search results:
${searchContext}

Extract:
- languages: Programming languages used (e.g., ["JavaScript", "TypeScript", "Python", "Go"])
- frameworks: Frameworks and libraries (e.g., ["React", "Next.js", "Express", "Django"])
- infrastructure: Infrastructure and cloud services (e.g., ["AWS", "Vercel", "PostgreSQL", "Redis"])
- tools: Development tools and platforms (e.g., ["GitHub", "Docker", "Kubernetes", "Terraform"])
- techStack: Combined array of all technologies (for convenience)

Return only confirmed technologies. If uncertain, omit the field.`;

      const result = await this.extractWithLLM(
        prompt,
        TechStackResultSchema,
        `Extract tech stack for ${companyName || website}`
      );

      // Process results with confidence and sources
      if (result.languages && result.languages.length > 0) {
        fields['languages'] = result.languages;
        confidence['languages'] = websiteContent.length > 0 ? 0.8 : 0.65;
        sources['languages'] = websiteUrl ? [websiteUrl] : searchResults.slice(0, 2).map(r => r.url);
      }

      if (result.frameworks && result.frameworks.length > 0) {
        fields['frameworks'] = result.frameworks;
        confidence['frameworks'] = websiteContent.length > 0 ? 0.8 : 0.65;
        sources['frameworks'] = websiteUrl ? [websiteUrl] : searchResults.slice(0, 2).map(r => r.url);
      }

      if (result.infrastructure && result.infrastructure.length > 0) {
        fields['infrastructure'] = result.infrastructure;
        confidence['infrastructure'] = 0.75;
        sources['infrastructure'] = searchResults
          .filter(r => r.url.includes('stackshare') || r.url.includes('builtwith'))
          .slice(0, 2)
          .map(r => r.url);
      }

      if (result.tools && result.tools.length > 0) {
        fields['tools'] = result.tools;
        confidence['tools'] = 0.7;
        sources['tools'] = searchResults.slice(0, 2).map(r => r.url);
      }

      // Combine into techStack array
      const allTech: string[] = [
        ...(result.languages || []),
        ...(result.frameworks || []),
        ...(result.infrastructure || []),
        ...(result.tools || []),
      ];
      
      if (allTech.length > 0) {
        fields['techStack'] = [...new Set(allTech)]; // Deduplicate
        confidence['techStack'] = Math.max(
          ...Object.values(confidence).filter((v): v is number => typeof v === 'number')
        );
        sources['techStack'] = [
          ...new Set(Object.values(sources).flat()),
        ];
      }

    } catch (error) {
      errors['techStack'] = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TechStackAgent] Error:', error);
    }

    return { fields, confidence, sources, errors };
  }
}

