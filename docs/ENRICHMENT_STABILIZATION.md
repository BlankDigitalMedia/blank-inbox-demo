# Contact Enrichment Flow Stabilization

## Summary

This document outlines the root cause analysis and fixes applied to stabilize the contact enrichment flow. The enrichment system uses an agent-based architecture with multiple specialized agents (Discovery, Company Profile, Funding, Tech Stack, Person, General) that extract information from web sources using OpenAI's structured output API.

## Root Cause Analysis

### Primary Issue: OpenAI Schema Format Incompatibility

**Error**: `400 Invalid schema for response_format 'enrichment_result': In context=('properties', 'website', 'anyOf', '0'), 'uri' is not a valid format.`

**Root Cause**: 
- Zod's `z.string().url()` validator generates JSON Schema with `format: "uri"`
- OpenAI's structured output API (used via `zodResponseFormat`) doesn't recognize `"uri"` as a valid format
- OpenAI only accepts `"uri-reference"` or no format field at all
- This caused DiscoveryAgent and PersonAgent to fail when extracting URL fields (`website`, `linkedinUrl`)

**Impact**: 
- DiscoveryAgent failed completely, preventing company discovery
- PersonAgent failed when extracting LinkedIn URLs
- Orchestrator continued but with incomplete data
- Users saw generic error messages

## Fixes Applied

### 1. Fixed Zod Schema URL Format Issue ✅

**File**: `lib/enrichment/agent-architecture/core/agent-base.ts`

- Created custom `urlString` schema helper that validates URLs without generating the problematic `format: "uri"` field
- Uses Zod's `.refine()` method with manual URL validation via `new URL()` constructor
- Updated DiscoveryAgent and PersonAgent to use `urlString` instead of `z.string().url()`

**Before**:
```typescript
website: z.string().url().nullable()
```

**After**:
```typescript
import { urlString } from '../core/agent-base';
website: urlString.nullable()
```

### 2. Added Retry Logic with Exponential Backoff ✅

**File**: `lib/enrichment/agent-architecture/core/agent-base.ts`

- Enhanced `extractWithLLM()` method with retry logic (3 attempts by default)
- Exponential backoff: 1s, 2s, 4s delays between retries
- Smart retry logic: doesn't retry on 400 errors (schema validation errors are permanent)
- Only retries transient errors (network issues, rate limits, etc.)

**Benefits**:
- Handles transient OpenAI API failures gracefully
- Reduces false negatives from temporary network issues
- Improves reliability without unnecessary retries on permanent errors

### 3. Improved Error Handling & Graceful Degradation ✅

**Files**: 
- `lib/enrichment/agent-architecture/orchestrator.ts`
- `lib/enrichment/strategies/agent-enrichment-strategy.ts`
- `app/api/enrich/route.ts`

**Changes**:
- Orchestrator now continues execution even if individual agents fail
- Each agent's errors are logged but don't stop the entire enrichment process
- Partial results are returned instead of failing completely
- Better error messages with context-aware messaging
- HTTP status code mapping for better error handling

**Before**: One agent failure → entire enrichment fails
**After**: One agent failure → other agents continue, partial results returned

### 4. Added Result Validation ✅

**File**: `lib/enrichment/strategies/agent-enrichment-strategy.ts`

- Validates enrichment results before returning
- Ensures confidence scores are valid (0-1 range)
- Filters out invalid results instead of failing completely
- Logs warnings for invalid data

**Benefits**:
- Prevents invalid data from reaching the database
- Improves data quality
- Better debugging with validation warnings

### 5. Added Timeout Handling ✅

**File**: `app/api/enrich/route.ts`

- Added 60-second timeout for enrichment operations
- Prevents enrichment from hanging indefinitely
- Uses `Promise.race()` pattern for timeout implementation
- Clear timeout error messages

**Benefits**:
- Prevents API routes from hanging
- Better user experience with predictable timeouts
- Resource cleanup for long-running operations

### 6. Enhanced Error Messages ✅

**Files**: 
- `app/api/enrich/route.ts`
- `lib/enrichment/strategies/agent-enrichment-strategy.ts`

**Changes**:
- Context-aware error messages (schema errors vs. network errors)
- HTTP status code mapping (400, 429, 500, 502, 503)
- Development vs. production error detail levels
- User-friendly messages instead of raw error strings

## Architecture Flow

```
User clicks "Enrich" button
  ↓
POST /api/enrich
  ↓
AgentEnrichmentStrategy.enrichEmail()
  ├─ Check skip list
  ├─ SimpleEnrichmentOrchestrator.enrichEmail()
  │   ├─ Phase 1: DiscoveryAgent (company basics)
  │   ├─ Phase 2: CompanyProfileAgent (industry, HQ, etc.)
  │   ├─ Phase 3: FundingAgent (funding info)
  │   ├─ Phase 4: TechStackAgent (tech stack)
  │   ├─ Phase 5: PersonAgent (person info)
  │   └─ Phase 6: GeneralAgent (custom fields)
  ├─ Validate results
  └─ Return enrichments
  ↓
Save to Convex via updateEnrichment mutation
```

## Testing Recommendations

1. **Test URL Fields**: Verify `website` and `linkedinUrl` fields extract correctly
2. **Test Partial Failures**: Verify enrichment continues when one agent fails
3. **Test Retry Logic**: Simulate transient errors to verify retries work
4. **Test Timeout**: Verify timeout triggers after 60 seconds
5. **Test Error Messages**: Verify user-friendly error messages appear

## Future Improvements

1. **Rate Limiting**: Add rate limiting specifically for enrichment API calls
2. **Caching**: Cache enrichment results to avoid redundant API calls
3. **Parallel Execution**: Consider running independent agents in parallel
4. **Progress Updates**: Add WebSocket/SSE for real-time enrichment progress
5. **Batch Enrichment**: Support enriching multiple contacts at once

## Files Modified

- `lib/enrichment/agent-architecture/core/agent-base.ts` - URL schema helper + retry logic
- `lib/enrichment/agent-architecture/agents/discovery-agent.ts` - Use urlString schema
- `lib/enrichment/agent-architecture/agents/person-agent.ts` - Use urlString schema
- `lib/enrichment/agent-architecture/orchestrator.ts` - Improved error handling
- `lib/enrichment/strategies/agent-enrichment-strategy.ts` - Result validation + error handling
- `app/api/enrich/route.ts` - Timeout handling + better error messages

## Related Documentation

- `AGENTS.md` - Overall project architecture
- `docs/VALIDATION.md` - Zod schema validation patterns
- `docs/SECURITY.md` - Security best practices

