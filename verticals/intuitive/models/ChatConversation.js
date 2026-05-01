'use strict';

module.exports = (sequelize, DataTypes) => {
  const ChatConversation = sequelize.define('IntuitiveChatConversation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    conversation_id: { type: DataTypes.UUID, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    project_id: { type: DataTypes.INTEGER, allowNull: true },
    title: { type: DataTypes.TEXT },
    messages: { type: DataTypes.JSONB, defaultValue: [], comment: 'array of { role, content, tool_calls, tool_results, ts }' },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'intuitive_chat_conversations',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['conversation_id'] },
      { fields: ['user_id'] },
    ],
  });
  return ChatConversation;
};
