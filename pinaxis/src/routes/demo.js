'use strict';

const express = require('express');
const router = express.Router();
const syntheticData = require('../services/synthetic-data');
const analyticsService = require('../services/analytics');
const productMatcher = require('../services/product-matcher');

// POST /api/v1/demo/generate — Create demo project with synthetic data
router.post('/generate', async (req, res) => {
  try {
    const { company_name } = req.body;

    // 1. Create project
    const crypto = require('crypto');
    const project = await req.models.PinaxisProject.create({
      project_code: `DEMO-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      company_name: company_name || 'Demo Warehouse Co.',
      contact_name: 'Demo User',
      contact_email: 'demo@pinaxis.com',
      industry: 'E-Commerce / Retail',
      country: 'Germany',
      business_info: {
        warehouse_size_sqm: 12000,
        employees: 85,
        shifts_per_day: 2,
        operating_days_per_week: 5,
        growth_forecast_pct: 15
      },
      status: 'uploading'
    });

    // 2. Generate synthetic data
    const data = syntheticData.generate();

    // 3. Insert item master
    const itemRecords = data.itemMaster.map(row => ({ ...row, project_id: project.id }));
    await req.models.PinaxisItemMaster.bulkCreate(itemRecords);

    await req.models.PinaxisUploadedFile.create({
      project_id: project.id,
      file_type: 'item_master',
      original_filename: 'demo_item_master.csv',
      file_size: 0,
      mime_type: 'text/csv',
      row_count: itemRecords.length,
      column_count: 10,
      parse_status: 'parsed'
    });

    // 4. Insert inventory
    const invRecords = data.inventory.map(row => ({ ...row, project_id: project.id }));
    await req.models.PinaxisInventoryData.bulkCreate(invRecords);

    await req.models.PinaxisUploadedFile.create({
      project_id: project.id,
      file_type: 'inventory',
      original_filename: 'demo_inventory.csv',
      file_size: 0,
      mime_type: 'text/csv',
      row_count: invRecords.length,
      column_count: 5,
      parse_status: 'parsed'
    });

    // 5. Insert goods in
    const giRecords = data.goodsIn.map(row => ({ ...row, project_id: project.id }));
    await req.models.PinaxisGoodsInData.bulkCreate(giRecords);

    await req.models.PinaxisUploadedFile.create({
      project_id: project.id,
      file_type: 'goods_in',
      original_filename: 'demo_goods_in.csv',
      file_size: 0,
      mime_type: 'text/csv',
      row_count: giRecords.length,
      column_count: 6,
      parse_status: 'parsed'
    });

    // 6. Insert goods out (batch in chunks to avoid timeout)
    const goRecords = data.goodsOut.map(row => ({ ...row, project_id: project.id }));
    const BATCH_SIZE = 5000;
    for (let i = 0; i < goRecords.length; i += BATCH_SIZE) {
      await req.models.PinaxisGoodsOutData.bulkCreate(goRecords.slice(i, i + BATCH_SIZE));
    }

    await req.models.PinaxisUploadedFile.create({
      project_id: project.id,
      file_type: 'goods_out',
      original_filename: 'demo_goods_out.csv',
      file_size: 0,
      mime_type: 'text/csv',
      row_count: goRecords.length,
      column_count: 10,
      parse_status: 'parsed'
    });

    // 7. Run analysis
    await project.update({ status: 'analyzing', analysis_started_at: new Date() });
    const analysisResults = await analyticsService.runAll(req.models, project.id);

    // 8. Run product matching
    const analysisMap = {};
    const savedResults = await req.models.PinaxisAnalysisResult.findAll({
      where: { project_id: project.id }
    });
    for (const r of savedResults) {
      analysisMap[r.analysis_type] = r.result_data;
    }

    const recommendations = await productMatcher.match(analysisMap);
    const recRecords = recommendations.map(rec => ({
      ...rec,
      project_id: project.id,
      computed_at: new Date()
    }));
    await req.models.PinaxisProductRecommendation.bulkCreate(recRecords);

    await project.update({ status: 'completed', analysis_completed_at: new Date() });

    res.status(201).json({
      success: true,
      data: {
        project_id: project.id,
        project_code: project.project_code,
        items: itemRecords.length,
        inventory_records: invRecords.length,
        goods_in_records: giRecords.length,
        goods_out_records: goRecords.length,
        analyses_completed: Object.keys(analysisResults).length,
        recommendations: recommendations.length,
        dashboard_url: `/pinaxis/?project=${project.project_code}`
      }
    });
  } catch (error) {
    console.error('PINAXIS demo generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
