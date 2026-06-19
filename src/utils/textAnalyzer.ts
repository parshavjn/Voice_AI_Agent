import { RuleAudit } from '../types';

export function analyzeVoiceStyle(text: string): RuleAudit[] {
  if (!text || text.trim() === '') {
    return [];
  }

  const cleanText = text.trim();
  const paragraphs = cleanText.split(/\n+/).filter(p => p.trim().length > 0);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);

  const audits: RuleAudit[] = [];

  // Paragraph Count Audit
  const paraCount = paragraphs.length;
  const isParaOk = paraCount >= 2 && paraCount <= 3;
  audits.push({
    name: "Paragraph Count Limit",
    description: "Writeup must be exactly 2 or 3 paragraphs.",
    passed: isParaOk,
    statusText: `${paraCount} paragraph${paraCount === 1 ? '' : 's'}`,
    type: isParaOk ? 'success' : 'warn'
  });

  // Word Count Audit
  const wordCount = words.length;
  const isWordCountOk = wordCount < 220;
  audits.push({
    name: "Word Count Ceiling",
    description: "Strictly under 220 words total.",
    passed: isWordCountOk,
    statusText: `${wordCount} words / 219 limit`,
    type: isWordCountOk ? 'success' : 'warn'
  });

  // Forbidden Openings Audit
  const lowerText = cleanText.toLowerCase();
  const startsWithForbidden = 
    lowerText.startsWith("in today's world") || 
    lowerText.startsWith("in todays world") || 
    lowerText.startsWith("as a pm") || 
    lowerText.startsWith("as a product manager");
  audits.push({
    name: "Actionable Hook",
    description: "No generic openings like 'In today's world' or 'As a PM...'.",
    passed: !startsWithForbidden,
    statusText: startsWithForbidden ? "Forbidden prefix found!" : "Clean start",
    type: !startsWithForbidden ? 'success' : 'warn'
  });

  // Jargon Check
  const jargonList = ['synergy', 'leverage', 'paradigm', 'disruption', 'disruptive', 'optimize', 'delight the customer'];
  const foundJargon = jargonList.filter(jargon => lowerText.includes(jargon));
  const isJargonFree = foundJargon.length === 0;
  audits.push({
    name: "Zero Corporate Jargon",
    description: "Keeps it street-smart and human. Avoids buzzwords.",
    passed: isJargonFree,
    statusText: isJargonFree ? "No jargon" : `Found: ${foundJargon.join(', ')}`,
    type: isJargonFree ? 'success' : 'warn'
  });

  // Conversational Hindi (Hinglish) Check
  const hindiWords = ['yaar', 'dekho', 'bilkul', 'aur suno', 'bhai', 'fayda', 'sahi', 'nuksan', 'chal', 'kya'];
  const foundHindi = hindiWords.filter(hw => lowerText.includes(hw));
  const hasHindi = foundHindi.length > 0;
  audits.push({
    name: "Hinglish Slang Mix",
    description: "Naturally blends conversational markers like 'yaar' or 'dekho'.",
    passed: hasHindi,
    statusText: hasHindi ? `Included: ${foundHindi.join(', ')}` : "Missing Hinglish feel",
    type: hasHindi ? 'success' : 'info'
  });

  // Indian Sandbox Context
  const indianBrands = ['zerodha', 'zomato', 'cred', 'zee5', 'nykaa', 'blinkit', 'swiggy', 'paytm', 'delhi', 'ghaziabad', 'ncr'];
  const foundBrands = indianBrands.filter(brand => lowerText.includes(brand));
  const hasIndianBrands = foundBrands.length > 0;
  audits.push({
    name: "Delhi / Indian Sandbox",
    description: "Frames insights with relatable local examples like Zomato, Zerodha or CRED.",
    passed: hasIndianBrands,
    statusText: hasIndianBrands ? `Spotted: ${foundBrands.join(', ')}` : "No local startup context",
    type: hasIndianBrands ? 'success' : 'info'
  });

  // Cricket or Bollywood references
  const cultureWords = [
    'cricket', 'bouncer', 'sixer', 'yorker', 'stadium', 'pitch', 'century', 'dialogue', 
    'bollywood', 'blockbuster', 'flop', 'hero', 'climax', 'director', 'cinema', 'shahrukh', 'srk'
  ];
  const foundCulture = cultureWords.filter(cw => lowerText.includes(cw));
  const hasCulture = foundCulture.length > 0;
  audits.push({
    name: "Cricket or Bollywood Metaphors",
    description: "Simplifies key insights with cricket playbooks or dramatic film rules.",
    passed: hasCulture,
    statusText: hasCulture ? `Analogies: ${foundCulture.join(', ')}` : "No cricket or movie rules found",
    type: hasCulture ? 'success' : 'info'
  });

  // "So What?" Challenge
  const hasSoWhat = lowerText.includes("so what") || lowerText.includes("so, what");
  audits.push({
    name: "The 'So What?' Test",
    description: "Strictly questions the real business outcome of an execution.",
    passed: hasSoWhat,
    statusText: hasSoWhat ? "Challenged" : "Missed outcome check",
    type: hasSoWhat ? 'success' : 'warn'
  });

  return audits;
}
