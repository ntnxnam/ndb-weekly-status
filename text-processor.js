/**
 * Text Processor for AI Summarization
 * Processes custom field text to create succinct summaries with dates
 */

class TextProcessor {
  constructor() {
    // Date patterns to extract
    this.datePatterns = [
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g, // MM/DD/YYYY, DD-MM-YYYY
      /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g, // YYYY-MM-DD
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi, // January 15, 2024
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/gi, // January 15
      /(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/gi, // 15 January 2024
    ];
  }

  // Extract dates from text
  extractDates(text) {
    if (!text || typeof text !== 'string') return [];
    
    const dates = [];
    this.datePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        dates.push(...matches);
      }
    });
    
    // Remove duplicates and normalize
    return [...new Set(dates.map(d => d.trim()))];
  }

  // Extract key information (dates, action items, status)
  extractKeyInfo(text) {
    if (!text || typeof text !== 'string') return null;
    
    const dates = this.extractDates(text);
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Look for action items, status updates, key decisions
    const keyPhrases = [
      /completed|done|finished|resolved/gi,
      /in progress|ongoing|working on/gi,
      /blocked|issue|problem/gi,
      /decision|decided|agreed/gi,
      /next steps|action items|todo/gi
    ];
    
    const relevantLines = lines.filter(line => {
      return keyPhrases.some(phrase => phrase.test(line)) || 
             dates.some(date => line.includes(date));
    });
    
    return {
      dates: dates,
      relevantLines: relevantLines.slice(0, 3), // Top 3 relevant lines
      hasStatus: /completed|done|finished|resolved|in progress|blocked/gi.test(text),
      hasAction: /next steps|action|todo|task/gi.test(text)
    };
  }

  // Create a succinct summary
  summarize(text, maxLength = 150) {
    if (!text || typeof text !== 'string') {
      return { summary: '', date: null };
    }
    
    // Clean the text
    let cleanText = text.trim();
    
    // Remove excessive whitespace
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    // Extract dates
    const dates = this.extractDates(cleanText);
    const latestDate = dates.length > 0 ? dates[dates.length - 1] : null;
    
    // Extract key information
    const keyInfo = this.extractKeyInfo(cleanText);
    
    // Create summary
    let summary = '';
    
    // If we have relevant lines, use them
    if (keyInfo && keyInfo.relevantLines.length > 0) {
      summary = keyInfo.relevantLines.join('. ').substring(0, maxLength);
    } else {
      // Otherwise, take first sentences
      const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 10);
      summary = sentences.slice(0, 2).join('. ').substring(0, maxLength);
    }
    
    // Add ellipsis if truncated
    if (summary.length >= maxLength) {
      summary = summary.substring(0, maxLength - 3) + '...';
    }
    
    // Format: "Summary text [Date]"
    if (latestDate) {
      return {
        summary: summary.trim(),
        date: latestDate,
        display: `${summary.trim()} [${latestDate}]`
      };
    }
    
    return {
      summary: summary.trim(),
      date: null,
      display: summary.trim()
    };
  }

  // Batch summarize multiple texts
  batchSummarize(texts) {
    return texts.map(text => this.summarize(text));
  }
}

module.exports = TextProcessor;

