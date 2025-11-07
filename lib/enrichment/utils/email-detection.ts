export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmail(email: string): {
  localPart: string;
  domain: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
} | null {
  const emailRegex = /^([^@]+)@([^@]+)$/;
  const match = email.match(emailRegex);
  
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const [, localPart, domain] = match;
  const result: {
    localPart: string;
    domain: string;
    companyName?: string;
    firstName?: string;
    lastName?: string;
  } = {
    localPart,
    domain,
  };

  // Extract company name from domain and capitalize properly
  const domainParts = domain.split('.');
  if (domainParts.length >= 2) {
    // Known company mappings for proper capitalization
    const knownCompanies: Record<string, string> = {
      'onetrust': 'OneTrust',
      'sideguide': 'Sideguide',
      'frontapp': 'Front',
      'shippo': 'Shippo',
      'lattice': 'Lattice',
      'pilot': 'Pilot',
      'fundera': 'Fundera',
      'flexport': 'Flexport',
      'triplebyte': 'Triplebyte',
      'zola': 'Zola',
      'pinterest': 'Pinterest',
      'brex': 'Brex',
      'deel': 'Deel',
      'scale': 'Scale AI',
      'wiz': 'Wiz',
      'firecrawl': 'Firecrawl',
    };
    
    // Get the main domain part
    const firstPart = domainParts[0];
    if (firstPart) {
      const rawName = firstPart.toLowerCase();
      
      // Check if it's a known company
      if (knownCompanies[rawName]) {
        result.companyName = knownCompanies[rawName];
      } else {
        // Handle hyphenated names: my-company -> My Company
        const words = firstPart.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        );
        result.companyName = words.join(' ');
      }
    }
  }

  // Try to extract name from local part
  const nameParts = localPart.split(/[._-]/);
  if (nameParts.length >= 2) {
    result.firstName = nameParts[0];
    result.lastName = nameParts[nameParts.length - 1];
  } else if (nameParts.length === 1) {
    // Check if it's a combined name like "johnsmith"
    const combinedMatch = localPart.match(/^([a-z]+)([A-Z][a-z]+)$/);
    if (combinedMatch && combinedMatch[1] && combinedMatch[2]) {
      result.firstName = combinedMatch[1];
      result.lastName = combinedMatch[2].toLowerCase();
    }
  }

  return result;
}

