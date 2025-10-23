const axios = require('axios');

/**
 * Business Collector MCP Proxy
 * Integrates the RinglyPro Public Business Collector into the AI Copilot
 */
class BusinessCollectorMCPProxy {
  constructor(baseUrl = null) {
    this.baseUrl = baseUrl || process.env.BUSINESS_COLLECTOR_URL ||
                   'https://ringlypro-public-business-collector.onrender.com';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000, // 2 minutes for large collections
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RinglyPro-AI-Copilot/1.0'
      }
    });
  }

  /**
   * Check if the Business Collector service is healthy
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health');
      return {
        success: true,
        status: response.data.status,
        version: response.data.version,
        timestamp: response.data.timestamp
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'offline'
      };
    }
  }

  /**
   * Collect business data by category and geography
   * @param {Object} params - Collection parameters
   * @param {string} params.category - Business category (e.g., "Real Estate Agents")
   * @param {string} params.geography - Geographic location (e.g., "Florida", "Tampa, FL")
   * @param {number} params.maxResults - Maximum number of results (default: 100)
   * @param {string[]} params.synonyms - Optional category synonyms
   * @param {Object} params.sourceHints - Optional source hints
   */
  async collectBusinesses(params) {
    const {
      category,
      geography,
      maxResults = 100,
      synonyms = [],
      sourceHints = {}
    } = params;

    if (!category || !geography) {
      throw new Error('Category and geography are required');
    }

    try {
      const response = await this.client.post('/run', {
        category,
        geography,
        maxResults,
        synonyms,
        sourceHints
      });

      return {
        success: true,
        meta: response.data.meta,
        businesses: response.data.rows,
        summary: {
          total: response.data.meta.total_found,
          category: response.data.meta.category,
          geography: response.data.meta.geography,
          sources: response.data.meta.sources_used,
          executionTime: response.data.meta.execution_time_ms
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || null
      };
    }
  }

  /**
   * Quick collection with simple parameters (GET endpoint)
   * @param {string} category - Business category
   * @param {string} geography - Geographic location
   * @param {number} max - Maximum results
   */
  async quickCollect(category, geography, max = 50) {
    try {
      const response = await this.client.get('/run', {
        params: { category, geo: geography, max }
      });

      return {
        success: true,
        meta: response.data.meta,
        businesses: response.data.rows,
        summary: {
          total: response.data.meta.total_found,
          category: response.data.meta.category,
          geography: response.data.meta.geography
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || null
      };
    }
  }

  /**
   * Format business data for display in AI Copilot
   * @param {Array} businesses - Array of business records
   * @param {number} limit - Maximum number to format (default: 10)
   */
  formatForDisplay(businesses, limit = 10) {
    const displayList = businesses.slice(0, limit);

    return displayList.map((business, index) => {
      const parts = [];

      if (business.business_name) {
        parts.push(`**${business.business_name}**`);
      }

      if (business.category) {
        parts.push(`Category: ${business.category}`);
      }

      if (business.phone) {
        parts.push(`📞 ${business.phone}`);
      }

      if (business.email) {
        parts.push(`✉️ ${business.email}`);
      }

      if (business.website) {
        parts.push(`🌐 ${business.website}`);
      }

      const address = [
        business.street,
        business.city,
        business.state,
        business.postal_code
      ].filter(Boolean).join(', ');

      if (address) {
        parts.push(`📍 ${address}`);
      }

      if (business.confidence) {
        parts.push(`Confidence: ${(business.confidence * 100).toFixed(0)}%`);
      }

      return `${index + 1}. ${parts.join(' | ')}`;
    }).join('\n\n');
  }

  /**
   * Convert businesses to importable format for CRM
   * @param {Array} businesses - Array of business records
   */
  convertToCRMFormat(businesses) {
    return businesses.map(business => ({
      business_name: business.business_name,
      phone: business.phone,
      email: business.email,
      website: business.website,
      address: {
        street: business.street,
        city: business.city,
        state: business.state,
        postal_code: business.postal_code,
        country: business.country || 'US'
      },
      category: business.category,
      source: 'Business Collector',
      source_url: business.source_url,
      confidence: business.confidence,
      notes: business.notes,
      collected_at: new Date().toISOString()
    }));
  }

  /**
   * Get collection statistics
   * @param {Object} meta - Collection metadata
   */
  getStatistics(meta) {
    return {
      total_found: meta.total_found,
      category: meta.category,
      geography: meta.geography,
      sources_used: meta.sources_used?.length || 0,
      source_list: meta.sources_used || [],
      execution_time_seconds: (meta.execution_time_ms / 1000).toFixed(2),
      deduplication_applied: meta.deduplication_applied || false,
      duplicates_removed: meta.duplicates_removed || 0,
      generated_at: meta.generated_at
    };
  }
}

module.exports = BusinessCollectorMCPProxy;
