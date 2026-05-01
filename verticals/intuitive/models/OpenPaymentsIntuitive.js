'use strict';

module.exports = (sequelize, DataTypes) => {
  const OpenPaymentsIntuitive = sequelize.define('IntuitiveOpenPaymentsIntuitive', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    npi: { type: DataTypes.STRING(15), allowNull: false },
    fiscal_year: { type: DataTypes.INTEGER, allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    categories: { type: DataTypes.JSONB, defaultValue: {} },
    last_payment_date: { type: DataTypes.DATEONLY },
    payment_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_open_payments_intuitive',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['npi', 'fiscal_year'] },
      { fields: ['npi'] },
    ],
  });
  return OpenPaymentsIntuitive;
};
