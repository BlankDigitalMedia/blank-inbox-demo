import type { EnrichmentField, EnrichmentResult, EmailContext } from './core/types';
import { parseEmailContext } from './tools/email-parser-tool';
import {
  DiscoveryAgent,
  CompanyProfileAgent,
  FundingAgent,
  TechStackAgent,
  PersonAgent,
  GeneralAgent,
} from './agents';

export class SimpleEnrichmentOrchestrator {
  private openaiApiKey: string;
  private firecrawlApiKey: string;

  constructor(openaiApiKey: string, firecrawlApiKey: string) {
    this.openaiApiKey = openaiApiKey;
    this.firecrawlApiKey = firecrawlApiKey;
  }

  /**
   * Default field set covering company + person data
   */
  private getDefaultFields(): EnrichmentField[] {
    return [
      // Company fields
      { name: 'companyName', displayName: 'Company Name', description: 'Official company name', type: 'string', required: false },
      { name: 'website', displayName: 'Website', description: 'Company website URL', type: 'string', required: false },
      { name: 'industry', displayName: 'Industry', description: 'Primary industry or sector', type: 'string', required: false },
      { name: 'headquarters', displayName: 'Headquarters', description: 'Headquarters location', type: 'string', required: false },
      { name: 'yearFounded', displayName: 'Year Founded', description: 'Year the company was founded', type: 'number', required: false },
      { name: 'employeeCount', displayName: 'Employee Count', description: 'Approximate employee count', type: 'string', required: false },
      { name: 'description', displayName: 'Description', description: 'Brief company description', type: 'string', required: false },
      { name: 'fundingStage', displayName: 'Funding Stage', description: 'Current funding stage', type: 'string', required: false },
      { name: 'totalRaised', displayName: 'Total Raised', description: 'Total funding raised', type: 'string', required: false },
      { name: 'lastRoundAmount', displayName: 'Last Round Amount', description: 'Most recent funding round', type: 'string', required: false },
      { name: 'investors', displayName: 'Investors', description: 'List of investors', type: 'array', required: false },
      { name: 'techStack', displayName: 'Tech Stack', description: 'Technology stack', type: 'array', required: false },
      // Person fields
      { name: 'titleNormalized', displayName: 'Job Title', description: 'Normalized job title', type: 'string', required: false },
      { name: 'seniority', displayName: 'Seniority', description: 'Seniority level', type: 'string', required: false },
      { name: 'department', displayName: 'Department', description: 'Department or team', type: 'string', required: false },
      { name: 'linkedinUrl', displayName: 'LinkedIn URL', description: 'LinkedIn profile URL', type: 'string', required: false },
      { name: 'location', displayName: 'Location', description: 'Location', type: 'string', required: false },
    ];
  }

  async enrichEmail(
    email: string,
    fields: EnrichmentField[] = []
  ): Promise<Record<string, EnrichmentResult>> {
    const emailContext = parseEmailContext(email);
    
    // If personal email, return empty results
    if (emailContext.isPersonalEmail) {
      return {};
    }

    // Use provided fields or default set
    const requestedFields = fields.length > 0 ? fields : this.getDefaultFields();

    // Initialize discovered data from email context
    let discoveredData: Record<string, any> = {
      email,
      domain: emailContext.domain,
      companyDomain: emailContext.companyDomain,
      companyNameGuess: emailContext.companyNameGuess,
      website: emailContext.companyDomain 
        ? `https://${emailContext.companyDomain}`
        : undefined,
    };

    // Initialize agents
    const discoveryAgent = new DiscoveryAgent(this.openaiApiKey, this.firecrawlApiKey);
    const companyProfileAgent = new CompanyProfileAgent(this.openaiApiKey, this.firecrawlApiKey);
    const fundingAgent = new FundingAgent(this.openaiApiKey, this.firecrawlApiKey);
    const techStackAgent = new TechStackAgent(this.openaiApiKey, this.firecrawlApiKey);
    const personAgent = new PersonAgent(this.openaiApiKey, this.firecrawlApiKey);
    const generalAgent = new GeneralAgent(this.openaiApiKey, this.firecrawlApiKey);

    // Run agents sequentially, accumulating discovered data and results
    const allResults: Record<string, EnrichmentResult> = {};

    // Phase 1: Discovery
    try {
      console.log('[Orchestrator] Running DiscoveryAgent...');
      const discoveryResult = await discoveryAgent.execute({
        email,
        emailContext,
        discoveredData,
        requestedFields,
      });
      
      // Merge discovered data
      Object.assign(discoveredData, discoveryResult.fields);
      
      // Convert to EnrichmentResult format
      for (const [fieldName, value] of Object.entries(discoveryResult.fields)) {
        allResults[fieldName] = {
          field: fieldName,
          value,
          confidence: discoveryResult.confidence[fieldName] ?? 0.7,
          source: discoveryResult.sources[fieldName]?.[0],
          sourceContext: discoveryResult.sources[fieldName]?.map(url => ({ url, snippet: '' })) || [],
        };
      }
      
      // Log any errors from the agent but continue
      if (discoveryResult.errors && Object.keys(discoveryResult.errors).length > 0) {
        console.warn('[Orchestrator] DiscoveryAgent completed with errors:', discoveryResult.errors);
      }
    } catch (error) {
      console.error('[Orchestrator] DiscoveryAgent failed (continuing with other agents):', error);
      // Continue execution - other agents may still succeed
    }

    // Phases 2-6 in parallel for maximum speed
    const parallelAgents = [
      { name: 'CompanyProfileAgent', run: () => companyProfileAgent.execute({ email, emailContext, discoveredData, requestedFields }) },
      { name: 'FundingAgent', run: () => fundingAgent.execute({ email, emailContext, discoveredData, requestedFields }) },
      { name: 'TechStackAgent', run: () => techStackAgent.execute({ email, emailContext, discoveredData, requestedFields }) },
      { name: 'PersonAgent', run: () => personAgent.execute({ email, emailContext, discoveredData, requestedFields }) },
      { name: 'GeneralAgent', run: () => generalAgent.execute({ email, emailContext, discoveredData, requestedFields }) },
    ];

    const results = await Promise.allSettled(parallelAgents.map(a => a.run()));

    results.forEach((res, idx) => {
      const agentName = parallelAgents[idx].name;
      if (res.status !== 'fulfilled') {
        console.error(`[Orchestrator] ${agentName} failed (parallel):`, res.reason);
        return;
      }
      const r = res.value;
      // Merge results
      for (const [fieldName, value] of Object.entries(r.fields)) {
        const existing = allResults[fieldName];
        const newConfidence = r.confidence[fieldName] ?? 0.7;
        if (!existing || newConfidence > existing.confidence) {
          allResults[fieldName] = {
            field: fieldName,
            value,
            confidence: newConfidence,
            source: r.sources[fieldName]?.[0],
            sourceContext: r.sources[fieldName]?.map(url => ({ url, snippet: '' })) || [],
          };
        }
      }
      if (r.errors && Object.keys(r.errors).length > 0) {
        console.warn(`[Orchestrator] ${agentName} completed with errors:`, r.errors);
      }
    });

    // Return all collected results, even if some agents failed
    console.log(`[Orchestrator] Enrichment completed. Collected ${Object.keys(allResults).length} fields.`);
    return allResults;
  }
}

