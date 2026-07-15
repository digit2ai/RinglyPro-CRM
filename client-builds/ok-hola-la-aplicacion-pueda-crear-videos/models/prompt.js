'use strict';
const { DataTypes } = require('sequelize');

// ok_hola_la_aplicacion_pueda_crear_videos_prompts
// The core artifact: raw free-form description + the structured video-generation prompt.
module.exports = (sequelize) => {
  const Prompt = sequelize.define('OkHolaPrompt', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, comment: 'Multi-tenant isolation' },
    raw_text: { type: DataTypes.TEXT, allowNull: false },       // unbounded — proves "no 60-line cap"
    structured: { type: DataTypes.JSONB, allowNull: false },     // {scenes[], style, durationSec, aspectRatio, platform}
    title: { type: DataTypes.STRING, allowNull: true },
    source: { type: DataTypes.STRING, defaultValue: 'llm' },     // 'llm' | 'mock'
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'ok_hola_la_aplicacion_pueda_crear_videos_prompts',
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }]
  });
  return Prompt;
};
