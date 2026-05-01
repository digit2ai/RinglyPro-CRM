'use strict';

module.exports = (sequelize, DataTypes) => {
  const ChatAudit = sequelize.define('IntuitiveChatAudit', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    conversation_id: { type: DataTypes.UUID, allowNull: true },
    question: { type: DataTypes.TEXT },
    total_tokens: { type: DataTypes.INTEGER, defaultValue: 0 },
    cached_tokens: { type: DataTypes.INTEGER, defaultValue: 0 },
    latency_ms: { type: DataTypes.INTEGER, defaultValue: 0 },
    tools_used: { type: DataTypes.JSONB, defaultValue: [] },
    error: { type: DataTypes.TEXT },
    ts: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_chat_audit',
    underscored: true,
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['ts'] },
    ],
  });
  return ChatAudit;
};
