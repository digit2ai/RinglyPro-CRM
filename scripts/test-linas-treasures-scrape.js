// Test scraping Lina's Treasures website locally
const { scrapeAndAnalyzeWebsite } = require('../src/services/aiWebsiteScraper');

async function testScrape() {
  console.log('🔍 Testing scrape of https://linastreasures.com...\n');

  try {
    const result = await scrapeAndAnalyzeWebsite({
      websiteUrl: 'https://linastreasures.com',
      businessType: 'retail'
    });

    console.log('✅ Scrape Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.aiProcessed?.categories) {
      console.log(`\n📦 Found ${result.aiProcessed.categories.length} categories`);
      result.aiProcessed.categories.forEach(cat => {
        console.log(`   - ${cat.name}: ${cat.items?.length || 0} items`);
      });
    } else {
      console.log('\n❌ No categories found');
      console.log('Error:', result.error);
    }

  } catch (error) {
    console.error('❌ Scrape failed:');
    console.error(error.message);
    console.error(error.stack);
  }
}

testScrape();
