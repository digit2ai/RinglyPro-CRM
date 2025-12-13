// =====================================================
// RinglyPro Pricing Component
// Embeddable pricing table with Stripe integration
// =====================================================

class RinglyProPricing {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || window.location.origin;
    this.containerId = options.containerId || 'ringlypro-pricing';
    this.isAnnual = false;
    this.annualDiscount = 0.15; // 15% discount

    // Pricing data with 14% increase
    this.pricingPlans = {
      free: {
        name: 'Free',
        description: 'Perfect for testing',
        monthlyPrice: 0,
        tokens: 100,
        costPerToken: null,
        features: [
          'All services available',
          'AI Copilot access',
          'Basic support',
          'No rollover'
        ],
        buttonText: 'Get Started Free',
        buttonClass: 'free'
      },
      starter: {
        name: 'Starter',
        description: 'For small businesses',
        monthlyPrice: 33,
        tokens: 500,
        costPerToken: 0.066,
        maxRollover: 1000,
        annualSavings: 60,
        features: [
          'All services included',
          'AI Copilot unlimited',
          'Priority support',
          'Rollover up to 1,000 tokens',
          'Business Collector'
        ],
        buttonText: 'Subscribe Now'
      },
      growth: {
        name: 'Growth',
        description: 'For growing businesses',
        monthlyPrice: 113,
        tokens: 2000,
        costPerToken: 0.0565,
        maxRollover: 5000,
        annualSavings: 203,
        popular: true,
        features: [
          'Everything in Starter',
          'Advanced analytics',
          'Outbound campaigns',
          'Rollover up to 5,000 tokens',
          'Premium support',
          'Team collaboration'
        ],
        buttonText: 'Subscribe Now'
      },
      professional: {
        name: 'Professional',
        description: 'For enterprises',
        monthlyPrice: 341,
        tokens: 7500,
        costPerToken: 0.0455,
        maxRollover: 'Unlimited',
        annualSavings: 615,
        features: [
          'Everything in Growth',
          'Unlimited rollover',
          'Dedicated account manager',
          'Custom integrations',
          'White-label options',
          '24/7 priority support'
        ],
        buttonText: 'Subscribe Now'
      }
    };

    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    container.innerHTML = `
      ${this.renderStyles()}
      <div class="ringlypro-pricing-wrapper">
        ${this.renderHeader()}
        ${this.renderBillingToggle()}
        ${this.renderPricingCards()}
        ${this.renderLoadingOverlay()}
      </div>
    `;
  }

  renderStyles() {
    return `
      <style>
        .ringlypro-pricing-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }

        .rp-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .rp-header h1 {
          font-size: 2.5rem;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 1rem;
        }

        .rp-header p {
          font-size: 1.125rem;
          color: #64748b;
          max-width: 600px;
          margin: 0 auto;
        }

        .rp-billing-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin: 2rem 0;
          color: #1e293b;
        }

        .rp-toggle-switch {
          position: relative;
          width: 60px;
          height: 30px;
          background: #e2e8f0;
          border-radius: 30px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .rp-toggle-switch.active {
          background: #10b981;
        }

        .rp-toggle-slider {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 24px;
          height: 24px;
          background: white;
          border-radius: 50%;
          transition: all 0.3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .rp-toggle-switch.active .rp-toggle-slider {
          left: 33px;
        }

        .rp-save-badge {
          background: #f59e0b;
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 700;
        }

        .rp-pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .rp-card {
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 16px;
          padding: 2rem 1.5rem;
          transition: all 0.3s;
          position: relative;
          overflow: hidden;
        }

        .rp-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          border-color: #6366f1;
        }

        .rp-card.popular {
          border: 3px solid #6366f1;
          transform: scale(1.05);
        }

        .rp-card.popular::before {
          content: 'MOST POPULAR';
          position: absolute;
          top: 15px;
          right: -35px;
          background: #6366f1;
          color: white;
          padding: 0.4rem 2.5rem;
          transform: rotate(45deg);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .rp-card-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .rp-tier-name {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 0.5rem;
        }

        .rp-tier-description {
          color: #64748b;
          font-size: 0.9rem;
        }

        .rp-price-container {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .rp-price {
          font-size: 3rem;
          font-weight: 900;
          color: #6366f1;
          line-height: 1;
        }

        .rp-price-currency {
          font-size: 1.5rem;
          vertical-align: super;
        }

        .rp-price-period {
          color: #64748b;
          font-size: 0.9rem;
          margin-left: 0.5rem;
        }

        .rp-tokens-info {
          background: #f1f5f9;
          padding: 1rem;
          border-radius: 10px;
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .rp-tokens-amount {
          font-size: 1.75rem;
          font-weight: 700;
          color: #6366f1;
        }

        .rp-tokens-label {
          color: #64748b;
          font-size: 0.85rem;
        }

        .rp-cost-per-token {
          color: #10b981;
          font-weight: 600;
          font-size: 0.8rem;
          margin-top: 0.5rem;
        }

        .rp-features {
          list-style: none;
          padding: 0;
          margin: 0 0 1.5rem 0;
        }

        .rp-features li {
          padding: 0.5rem 0;
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          color: #1e293b;
          font-size: 0.9rem;
        }

        .rp-check {
          color: #10b981;
          font-weight: 700;
          font-size: 1.1rem;
          flex-shrink: 0;
        }

        .rp-subscribe-btn {
          width: 100%;
          padding: 1rem 1.5rem;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
        }

        .rp-subscribe-btn:hover {
          background: #4f46e5;
          transform: translateY(-2px);
        }

        .rp-subscribe-btn.free {
          background: #64748b;
        }

        .rp-subscribe-btn.free:hover {
          background: #475569;
        }

        .rp-annual-savings {
          text-align: center;
          color: #10b981;
          font-weight: 600;
          margin-top: 1rem;
          font-size: 0.85rem;
          display: none;
        }

        .rp-loading-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 9999;
          align-items: center;
          justify-content: center;
        }

        .rp-loading-overlay.active {
          display: flex;
        }

        .rp-spinner {
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top: 4px solid white;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: rp-spin 1s linear infinite;
        }

        @keyframes rp-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .rp-pricing-grid {
            grid-template-columns: 1fr;
          }

          .rp-card.popular {
            transform: scale(1);
          }

          .rp-header h1 {
            font-size: 2rem;
          }
        }
      </style>
    `;
  }

  renderHeader() {
    return `
      <div class="rp-header">
        <h1>Choose Your Plan</h1>
        <p>Flexible token-based pricing. Pay only for what you use.</p>
      </div>
    `;
  }

  renderBillingToggle() {
    return `
      <div class="rp-billing-toggle">
        <span>Monthly</span>
        <div class="rp-toggle-switch" data-toggle="billing">
          <div class="rp-toggle-slider"></div>
        </div>
        <span>Annual</span>
        <span class="rp-save-badge">Save 15%</span>
      </div>
    `;
  }

  renderPricingCards() {
    const cards = Object.keys(this.pricingPlans).map(tier => {
      const plan = this.pricingPlans[tier];
      return this.renderCard(tier, plan);
    }).join('');

    return `<div class="rp-pricing-grid">${cards}</div>`;
  }

  renderCard(tier, plan) {
    const popularClass = plan.popular ? 'popular' : '';
    const buttonClass = plan.buttonClass || '';

    return `
      <div class="rp-card ${popularClass}" data-tier="${tier}">
        <div class="rp-card-header">
          <h3 class="rp-tier-name">${plan.name}</h3>
          <p class="rp-tier-description">${plan.description}</p>
        </div>

        <div class="rp-price-container">
          <div class="rp-price">
            <span class="rp-price-currency">$</span>
            <span class="rp-monthly-price">${plan.monthlyPrice}</span>
            <span class="rp-price-period">/month</span>
          </div>
        </div>

        <div class="rp-tokens-info">
          <div class="rp-tokens-amount">${plan.tokens.toLocaleString()}</div>
          <div class="rp-tokens-label">tokens/month</div>
          ${plan.costPerToken ? `<div class="rp-cost-per-token">$${plan.costPerToken.toFixed(4)} per token</div>` : ''}
        </div>

        <ul class="rp-features">
          ${plan.features.map(feature => `
            <li><span class="rp-check">✓</span> ${feature}</li>
          `).join('')}
        </ul>

        <button class="rp-subscribe-btn ${buttonClass}" data-tier="${tier}" data-price="${plan.monthlyPrice}" data-tokens="${plan.tokens}">
          ${plan.buttonText}
        </button>

        ${plan.annualSavings ? `
          <div class="rp-annual-savings">Save $${plan.annualSavings}/year</div>
        ` : ''}
      </div>
    `;
  }

  renderLoadingOverlay() {
    return `
      <div class="rp-loading-overlay" id="rpLoadingOverlay">
        <div class="rp-spinner"></div>
      </div>
    `;
  }

  attachEventListeners() {
    // Billing toggle
    const toggle = document.querySelector('[data-toggle="billing"]');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleBilling());
    }

    // Subscribe buttons
    const buttons = document.querySelectorAll('.rp-subscribe-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tier = e.target.dataset.tier;
        const price = parseInt(e.target.dataset.price);
        const tokens = parseInt(e.target.dataset.tokens);
        this.handleSubscribe(tier, price, tokens);
      });
    });
  }

  toggleBilling() {
    this.isAnnual = !this.isAnnual;

    const toggle = document.querySelector('[data-toggle="billing"]');
    toggle.classList.toggle('active');

    const savingsElements = document.querySelectorAll('.rp-annual-savings');
    savingsElements.forEach(el => {
      el.style.display = this.isAnnual ? 'block' : 'none';
    });

    // Update prices
    Object.keys(this.pricingPlans).forEach(tier => {
      const plan = this.pricingPlans[tier];
      if (plan.monthlyPrice > 0) {
        const card = document.querySelector(`[data-tier="${tier}"]`);
        const priceEl = card.querySelector('.rp-monthly-price');
        const buttonEl = card.querySelector('.rp-subscribe-btn');

        if (this.isAnnual) {
          const annualPrice = Math.floor(plan.monthlyPrice * 12 * (1 - this.annualDiscount));
          const effectiveMonthly = Math.floor(annualPrice / 12);
          priceEl.textContent = effectiveMonthly;
          buttonEl.textContent = `Pay $${annualPrice}/year`;
        } else {
          priceEl.textContent = plan.monthlyPrice;
          buttonEl.textContent = plan.buttonText;
        }
      }
    });
  }

  async handleSubscribe(tier, monthlyPrice, tokens) {
    console.log('Subscribe:', { tier, monthlyPrice, tokens, isAnnual: this.isAnnual });

    // Handle free tier
    if (tier === 'free') {
      window.location.href = '/register';
      return;
    }

    // Calculate final amount
    let finalAmount = monthlyPrice;
    let finalTokens = tokens;

    if (this.isAnnual) {
      finalAmount = Math.floor(monthlyPrice * 12 * (1 - this.annualDiscount));
      finalTokens = tokens * 12;
    }

    try {
      this.showLoading(true);

      const jwtToken = localStorage.getItem('token') || this.getCookie('token');

      if (!jwtToken) {
        alert('Please log in to subscribe');
        window.location.href = '/login?redirect=/pricing';
        return;
      }

      const response = await fetch(`${this.apiBaseUrl}/api/tokens/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          amount: finalAmount,
          tokens: finalTokens,
          package: tier,
          billing: this.isAnnual ? 'annual' : 'monthly'
        })
      });

      const data = await response.json();

      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }

    } catch (error) {
      console.error('Subscription error:', error);
      alert('Error: ' + error.message);
      this.showLoading(false);
    }
  }

  showLoading(show) {
    const overlay = document.getElementById('rpLoadingOverlay');
    if (overlay) {
      overlay.classList.toggle('active', show);
    }
  }

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  }
}

// Auto-initialize if container exists
if (typeof window !== 'undefined') {
  window.RinglyProPricing = RinglyProPricing;

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('ringlypro-pricing')) {
        new RinglyProPricing();
      }
    });
  } else {
    if (document.getElementById('ringlypro-pricing')) {
      new RinglyProPricing();
    }
  }
}
