// Test scraping PixlyPro website to verify menu import works
const { scrapeAndAnalyzeWebsite } = require('../src/services/aiWebsiteScraper');

async function testScrape() {
  console.log('🔍 Testing scrape of https://pixlypro.com...\n');

  try {
    const result = await scrapeAndAnalyzeWebsite({
      websiteUrl: 'https://pixlypro.com',
      businessType: 'service'
    });

    console.log('✅ Scrape Result:');
    console.log('Success:', result.success);

    if (result.success) {
      console.log('\n📊 Business Info:');
      console.log('Name:', result.aiProcessed?.businessInfo?.name);
      console.log('Tagline:', result.aiProcessed?.businessInfo?.tagline);
      console.log('Brand Style:', result.aiProcessed?.businessInfo?.brandStyle);

      console.log('\n🎨 Colors:');
      console.log('Primary:', result.aiProcessed?.colors?.primary);
      console.log('Secondary:', result.aiProcessed?.colors?.secondary);

      if (result.aiProcessed?.categories) {
        console.log(`\n📦 Found ${result.aiProcessed.categories.length} categories:`);
        result.aiProcessed.categories.forEach(cat => {
          console.log(`   - ${cat.name}: ${cat.items?.length || 0} items`);
          if (cat.items && cat.items.length > 0) {
            cat.items.slice(0, 3).forEach(item => {
              console.log(`      • ${item.name} - $${item.price || 'N/A'}`);
            });
          }
        });
      } else {
        console.log('\n⚠️  No categories found in aiProcessed');
        console.log('aiProcessed keys:', Object.keys(result.aiProcessed || {}));
      }
    } else {
      console.log('\n❌ Scrape failed');
      console.log('Error:', result.error);
    }

  } catch (error) {
    console.error('❌ Scrape failed:');
    console.error(error.message);
    console.error(error.stack);
  }
}

testScrape();
