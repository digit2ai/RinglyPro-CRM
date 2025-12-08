// =====================================================
// STOREFRONT AUTOMATION SERVICE
// Autonomous storefront creation with AI and integrations
// =====================================================

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const { scrapeAndAnalyzeWebsite } = require('./aiWebsiteScraper');
const { extractBrandFromWebsite } = require('./aiBrandExtractor');
const { enhancePhoto } = require('./aiPhotoEnhancer');

/**
 * Create storefront autonomously from website URL
 * Integrates AI scraping, brand extraction, and photo enhancement
 */
async function createStorefrontFromWebsite({
  clientId,
  businessName,
  businessSlug,
  businessType,
  websiteUrl,
  subscriptionPlan
}) {
  try {
    logger.info(`[Storefront Automation] Starting for client ${clientId}, website: ${websiteUrl}`);

    // Step 1: Create initial storefront record
    const [storefront] = await sequelize.query(
      `INSERT INTO storefront_businesses (
        ordergopro_client_id,
        business_name,
        business_slug,
        business_type,
        original_website_url,
        subscription_plan,
        website_import_status,
        is_published,
        ordering_enabled,
        created_at
      ) VALUES (
        :clientId,
        :businessName,
        :businessSlug,
        :businessType,
        :websiteUrl,
        :subscriptionPlan,
        'processing',
        false,
        true,
        NOW()
      ) RETURNING *`,
      {
        replacements: {
          clientId,
          businessName,
          businessSlug,
          businessType: businessType || 'restaurant',
          websiteUrl,
          subscriptionPlan: subscriptionPlan || 'essential'
        },
        type: QueryTypes.INSERT
      }
    );

    const storefrontId = storefront[0].id;
    logger.info(`[Storefront Automation] Created storefront ${storefrontId}`);

    // Step 2: AI Website Scraping (async)
    processWebsiteImport(storefrontId, websiteUrl, businessType).catch(error => {
      logger.error(`[Storefront Automation] Import failed for ${storefrontId}:`, error);
    });

    return {
      success: true,
      storefrontId,
      businessSlug,
      publicUrl: `https://aiagent.ringlypro.com/storefront/${businessSlug}`,
      embedCode: `<iframe src="https://aiagent.ringlypro.com/storefront/${businessSlug}" style="width: 100%; min-height: 900px; border: none;"></iframe>`,
      status: 'processing',
      message: 'Storefront is being created. This will take 1-2 minutes.'
    };

  } catch (error) {
    logger.error('[Storefront Automation] Creation error:', error);
    throw error;
  }
}

/**
 * Create storefront from design brief (no website)
 * Uses AI to generate brand based on preferences
 */
async function createStorefrontFromDesignBrief({
  clientId,
  businessName,
  businessSlug,
  businessType,
  designBrief,
  subscriptionPlan
}) {
  try {
    logger.info(`[Storefront Automation] Creating from design brief for client ${clientId}`);

    const {
      brandStyle,
      brandTone,
      colorPreference,
      targetAudience,
      menuCategories,
      specialRequirements
    } = designBrief;

    // Generate AI brand based on design brief
    const aiBrand = await generateBrandFromBrief({
      businessName,
      businessType,
      brandStyle,
      brandTone,
      colorPreference,
      targetAudience
    });

    // Create storefront with AI-generated brand
    const [storefront] = await sequelize.query(
      `INSERT INTO storefront_businesses (
        ordergopro_client_id,
        business_name,
        business_slug,
        business_type,
        tagline,
        description,
        primary_color,
        secondary_color,
        accent_color,
        brand_style,
        brand_tone,
        brand_keywords,
        subscription_plan,
        is_published,
        ordering_enabled,
        created_at
      ) VALUES (
        :clientId,
        :businessName,
        :businessSlug,
        :businessType,
        :tagline,
        :description,
        :primaryColor,
        :secondaryColor,
        :accentColor,
        :brandStyle,
        :brandTone,
        :brandKeywords,
        :subscriptionPlan,
        true,
        true,
        NOW()
      ) RETURNING *`,
      {
        replacements: {
          clientId,
          businessName,
          businessSlug,
          businessType: businessType || 'restaurant',
          tagline: aiBrand.tagline,
          description: aiBrand.brandStory,
          primaryColor: aiBrand.primaryColor,
          secondaryColor: aiBrand.secondaryColor,
          accentColor: aiBrand.accentColor,
          brandStyle: aiBrand.brandStyle,
          brandTone: aiBrand.brandTone,
          brandKeywords: aiBrand.brandKeywords,
          subscriptionPlan: subscriptionPlan || 'essential'
        },
        type: QueryTypes.INSERT
      }
    );

    const storefrontId = storefront[0].id;

    // Create categories from design brief
    if (menuCategories && menuCategories.length > 0) {
      for (let i = 0; i < menuCategories.length; i++) {
        const category = menuCategories[i];
        await sequelize.query(
          `INSERT INTO storefront_categories (
            storefront_id,
            name,
            slug,
            icon_emoji,
            display_order,
            is_active
          ) VALUES ($1, $2, $3, $4, $5, true)`,
          {
            replacements: [
              storefrontId,
              category.name,
              category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              category.icon || '📦',
              i + 1
            ],
            type: QueryTypes.INSERT
          }
        );
      }
    }

    logger.info(`[Storefront Automation] Created from design brief: ${storefrontId}`);

    return {
      success: true,
      storefrontId,
      businessSlug,
      publicUrl: `https://aiagent.ringlypro.com/storefront/${businessSlug}`,
      embedCode: `<iframe src="https://aiagent.ringlypro.com/storefront/${businessSlug}" style="width: 100%; min-height: 900px; border: none;"></iframe>`,
      status: 'ready',
      message: 'Storefront created! You can now add menu items.'
    };

  } catch (error) {
    logger.error('[Storefront Automation] Design brief creation error:', error);
    throw error;
  }
}

/**
 * Process website import asynchronously
 * Scrapes website, extracts brand, imports menu, enhances photos
 */
async function processWebsiteImport(storefrontId, websiteUrl, businessType) {
  try {
    logger.info(`[Storefront Automation] Processing import for storefront ${storefrontId}`);

    // Update status
    await sequelize.query(
      `UPDATE storefront_businesses
       SET website_import_status = 'scraping'
       WHERE id = :id`,
      {
        replacements: { id: storefrontId },
        type: QueryTypes.UPDATE
      }
    );

    // Step 1: Scrape website and extract menu
    const scrapedData = await scrapeAndAnalyzeWebsite({
      websiteUrl,
      businessType: businessType || 'restaurant'
    });

    if (!scrapedData.success) {
      throw new Error('Website scraping failed');
    }

    // Step 2: Extract brand information
    const brandData = await extractBrandFromWebsite({
      websiteUrl,
      businessType: businessType || 'restaurant'
    });

    // Step 3: Update storefront with brand info
    const keywords = brandData.brandKit?.brandKeywords || [];
    const keywordsArray = Array.isArray(keywords) ? `ARRAY[${keywords.map(k => `'${k.replace(/'/g, "''")}'`).join(', ')}]` : 'ARRAY[]::text[]';

    await sequelize.query(
      `UPDATE storefront_businesses
       SET tagline = :tagline,
           description = :description,
           primary_color = :primaryColor,
           secondary_color = :secondaryColor,
           accent_color = :accentColor,
           logo_url = :logoUrl,
           brand_style = :brandStyle,
           brand_tone = :brandTone,
           brand_keywords = ${keywordsArray},
           website_import_status = 'importing_menu'
       WHERE id = :id`,
      {
        replacements: {
          id: storefrontId,
          tagline: brandData.brandKit?.tagline || null,
          description: brandData.brandKit?.brandStory || null,
          primaryColor: brandData.brandKit?.primaryColor || '#6366f1',
          secondaryColor: brandData.brandKit?.secondaryColor || '#8b5cf6',
          accentColor: brandData.brandKit?.accentColor || '#ec4899',
          logoUrl: brandData.brandKit?.logo || null,
          brandStyle: brandData.brandKit?.brandStyle || 'modern',
          brandTone: brandData.brandKit?.brandTone || 'warm'
        },
        type: QueryTypes.UPDATE
      }
    );

    // Step 4: Import categories and items
    if (scrapedData.aiProcessed?.menu?.categories) {
      for (let catIndex = 0; catIndex < scrapedData.aiProcessed.menu.categories.length; catIndex++) {
        const category = scrapedData.aiProcessed.menu.categories[catIndex];

        // Create category
        const [categoryResult] = await sequelize.query(
          `INSERT INTO storefront_categories (
            storefront_id,
            name,
            slug,
            display_order,
            is_active
          ) VALUES ($1, $2, $3, $4, true)
          RETURNING id`,
          {
            replacements: [
              storefrontId,
              category.name,
              category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              catIndex + 1
            ],
            type: QueryTypes.INSERT
          }
        );

        const categoryId = categoryResult[0].id;

        // Import items for this category
        if (category.items && category.items.length > 0) {
          for (let itemIndex = 0; itemIndex < category.items.length; itemIndex++) {
            const item = category.items[itemIndex];

            let imageUrl = item.imageUrl || null;

            // Step 5: Enhance photo with PixlyPro (if available)
            if (imageUrl) {
              try {
                const enhanced = await enhancePhoto({
                  imageUrl,
                  enhancementType: 'food',
                  storefrontId
                });

                if (enhanced.success) {
                  imageUrl = enhanced.enhancedUrl;
                }
              } catch (photoError) {
                logger.warn(`[Storefront Automation] Photo enhancement failed for item: ${item.name}`, photoError);
                // Continue with original image
              }
            }

            // Create item
            await sequelize.query(
              `INSERT INTO storefront_items (
                storefront_id,
                category_id,
                name,
                slug,
                description,
                price,
                image_url,
                is_active,
                is_available,
                display_order
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, $8)
              ON CONFLICT (storefront_id, slug) DO NOTHING`,
              {
                replacements: [
                  storefrontId,
                  categoryId,
                  item.name,
                  item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  item.description || null,
                  item.price || null,
                  imageUrl,
                  itemIndex + 1
                ],
                type: QueryTypes.INSERT
              }
            );
          }
        }
      }
    }

    // Step 6: Mark as complete and publish
    await sequelize.query(
      `UPDATE storefront_businesses
       SET website_import_status = 'completed',
           is_published = true,
           updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: { id: storefrontId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[Storefront Automation] Import completed successfully for storefront ${storefrontId}`);

    // TODO: Send email/SMS notification to client
    // notifyClientStorefrontReady(storefrontId);

  } catch (error) {
    logger.error(`[Storefront Automation] Import failed for storefront ${storefrontId}:`, error);

    await sequelize.query(
      `UPDATE storefront_businesses
       SET website_import_status = 'failed'
       WHERE id = :id`,
      {
        replacements: { id: storefrontId },
        type: QueryTypes.UPDATE
      }
    );
  }
}

/**
 * Generate brand from design brief using AI
 */
async function generateBrandFromBrief({
  businessName,
  businessType,
  brandStyle,
  brandTone,
  colorPreference,
  targetAudience
}) {
  // TODO: Use OpenAI to generate comprehensive brand
  // For now, return template-based brand

  const colorPalettes = {
    warm: { primary: '#dc2626', secondary: '#f59e0b', accent: '#d97706' },
    cool: { primary: '#2563eb', secondary: '#06b6d4', accent: '#0284c7' },
    elegant: { primary: '#7c3aed', secondary: '#a855f7', accent: '#9333ea' },
    natural: { primary: '#10b981', secondary: '#059669', accent: '#047857' },
    modern: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#a78bfa' }
  };

  const palette = colorPalettes[colorPreference] || colorPalettes.modern;

  return {
    tagline: `${businessName} - Your ${businessType} destination`,
    brandStory: `Welcome to ${businessName}, where quality meets ${brandTone} service.`,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    brandStyle: brandStyle || 'modern',
    brandTone: brandTone || 'warm',
    brandKeywords: [businessType, brandStyle, brandTone, 'quality', 'service']
  };
}

module.exports = {
  createStorefrontFromWebsite,
  createStorefrontFromDesignBrief,
  processWebsiteImport
};
