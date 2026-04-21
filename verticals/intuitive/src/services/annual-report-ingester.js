'use strict';

/**
 * Annual Report Ingester
 * Ingests hospital annual reports (PDF or text) and extracts surgical
 * procedure volumes using Claude AI structured extraction.
 */

// Lazy-load Anthropic SDK (same pattern as hospital-research-agent.js)
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * Try to load pdf-parse; returns null if not installed
 */
function getPdfParse() {
  try {
    return require('pdf-parse');
  } catch (err) {
    return null;
  }
}

/**
 * Ingest an annual report from a URL (PDF or HTML)
 * @param {string} url - URL to fetch
 * @returns {Promise<{raw_text: string, extracted_procedures: Array, extraction_confidence: number, error?: string}>}
 */
async function ingestFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        raw_text: '',
        extracted_procedures: [],
        extraction_confidence: 0,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return await ingestFromBuffer(buffer, 'report.pdf');
    }

    // Treat as text/HTML
    const text = await response.text();
    // Strip HTML tags if present
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const extraction = await extractProcedures(cleanText);

    return {
      raw_text: cleanText,
      extracted_procedures: extraction.procedures,
      extraction_confidence: extraction.confidence
    };
  } catch (err) {
    return {
      raw_text: '',
      extracted_procedures: [],
      extraction_confidence: 0,
      error: `Ingestion error: ${err.message}`
    };
  }
}

/**
 * Ingest an annual report from a file buffer
 * @param {Buffer} buffer - File contents
 * @param {string} filename - Original filename (used to detect PDF)
 * @returns {Promise<{raw_text: string, extracted_procedures: Array, extraction_confidence: number, error?: string}>}
 */
async function ingestFromBuffer(buffer, filename) {
  try {
    let rawText;

    if (filename && filename.toLowerCase().endsWith('.pdf')) {
      const pdfParse = getPdfParse();
      if (!pdfParse) {
        return {
          raw_text: '',
          extracted_procedures: [],
          extraction_confidence: 0,
          error: 'pdf-parse is not installed. Run: npm install pdf-parse'
        };
      }

      const pdfData = await pdfParse(buffer);
      rawText = pdfData.text || '';
    } else {
      // Treat as plain text
      rawText = buffer.toString('utf-8');
    }

    if (!rawText || rawText.trim().length === 0) {
      return {
        raw_text: '',
        extracted_procedures: [],
        extraction_confidence: 0,
        error: 'No text content could be extracted from the file'
      };
    }

    const extraction = await extractProcedures(rawText);

    return {
      raw_text: rawText,
      extracted_procedures: extraction.procedures,
      extraction_confidence: extraction.confidence
    };
  } catch (err) {
    return {
      raw_text: '',
      extracted_procedures: [],
      extraction_confidence: 0,
      error: `Buffer ingestion error: ${err.message}`
    };
  }
}

/**
 * Use Claude Sonnet 4 to extract structured procedure volumes from report text
 * @param {string} rawText - Extracted text from the annual report
 * @returns {Promise<{procedures: Array, confidence: number}>}
 */
async function extractProcedures(rawText) {
  try {
    // Truncate very long texts to stay within context limits
    const maxChars = 100000;
    const truncatedText = rawText.length > maxChars
      ? rawText.substring(0, maxChars) + '\n[...truncated...]'
      : rawText;

    const anthropic = getAnthropic();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Extract all surgical procedure volumes from this hospital annual report text.

Return ONLY a JSON object with this exact structure (no markdown, no code fences):
{
  "procedures": [
    {
      "procedure": "Procedure name",
      "open_count": 0,
      "lap_count": 0,
      "robotic_count": 0,
      "total_count": 0,
      "year": 2025
    }
  ],
  "confidence": 0.85
}

Rules:
- "procedure" is the surgical procedure category (e.g., "Prostatectomy", "Hysterectomy", "Colectomy", "Lobectomy", etc.)
- "open_count" = open/traditional surgical approach count
- "lap_count" = laparoscopic/minimally invasive (non-robotic) count
- "robotic_count" = robotic-assisted (da Vinci) count
- "total_count" = sum of all approaches for that procedure
- "year" = the reporting year mentioned in the document
- If the report mentions "robotic surgery" or "da Vinci" specifically, capture those volumes under robotic_count
- If specific counts are not available but percentages and totals are mentioned, calculate the estimated counts
- If a breakdown by approach is not available, put the total in total_count and set the others to 0
- "confidence" is your overall confidence in the extraction (0.0 to 1.0) based on data clarity

Hospital Annual Report Text:
${truncatedText}`
        }
      ]
    });

    const content = response.content[0]?.text || '';

    // Parse the JSON response
    // Try to find JSON in the response (handle possible markdown fences)
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      procedures: Array.isArray(parsed.procedures) ? parsed.procedures : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
    };
  } catch (err) {
    return {
      procedures: [],
      confidence: 0,
      error: `Extraction error: ${err.message}`
    };
  }
}

module.exports = { ingestFromUrl, ingestFromBuffer, extractProcedures };
