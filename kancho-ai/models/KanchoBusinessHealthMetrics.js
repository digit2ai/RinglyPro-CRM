// kancho-ai/models/KanchoBusinessHealthMetrics.js
// Monthly KPI and Business Health Metrics tracking for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoBusinessHealthMetrics = sequelize.define('KanchoBusinessHealthMetrics', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'kancho_schools',
        key: 'id'
      }
    },
    report_month: {
      type: DataTypes.STRING(7), // YYYY-MM format
      allowNull: false,
      comment: 'Month of the report in YYYY-MM format'
    },

    // CORE KPI METRICS (Student Health)
    active_students: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total count of currently paying members'
    },
    net_student_growth: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'New students minus cancellations during the month'
    },
    churn_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: '(Cancellations / active students at start) × 100'
    },
    arps: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Average Revenue per Student: MRR / active students'
    },
    trial_conversion_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: '(Trials converted / total trials) × 100'
    },

    // Additional student metrics
    new_students: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'New students enrolled this month'
    },
    cancelled_students: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Students cancelled this month'
    },
    trials_started: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of trials started this month'
    },
    trials_converted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of trials converted to members'
    },

    // BUSINESS HEALTH FIELDS
    health_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      comment: 'Overall business health score (0-100)'
    },
    health_grade: {
      type: DataTypes.STRING(2),
      defaultValue: 'C',
      validate: {
        isIn: [['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']]
      },
      comment: 'Letter grade based on health score'
    },
    revenue_at_risk: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Dollar amount of revenue at risk from at-risk students'
    },
    students_at_risk: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Count of students showing churn risk signals'
    },
    growth_potential: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Dollar amount of potential revenue from hot leads'
    },
    hot_leads: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Count of high-potential leads'
    },
    monthly_revenue: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Actual monthly recurring revenue'
    },
    monthly_revenue_target: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Target monthly revenue'
    },
    revenue_vs_target_percent: {
      type: DataTypes.DECIMAL(6, 2),
      defaultValue: 0,
      comment: 'Revenue as percentage of target'
    },

    // Comparison metrics
    vs_previous_month: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Comparison metrics vs previous month'
    },

    // Metadata
    calculated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'When these metrics were calculated'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_business_health_metrics',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['report_month'] },
      { fields: ['health_score'] },
      { unique: true, fields: ['school_id', 'report_month'] }
    ]
  });

  KanchoBusinessHealthMetrics.associate = (models) => {
    KanchoBusinessHealthMetrics.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  /**
   * Calculate health grade from score
   * @param {number} score - Health score (0-100)
   * @returns {string} Letter grade
   */
  KanchoBusinessHealthMetrics.calculateGrade = (score) => {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
  };

  /**
   * Get health description for voice agent
   * @param {number} score - Health score (0-100)
   * @returns {string} Natural language description
   */
  KanchoBusinessHealthMetrics.getHealthDescription = (score) => {
    if (score >= 80) return 'strong and healthy';
    if (score >= 60) return 'stable but with some risks';
    return 'at risk and needs attention';
  };

  /**
   * Format metrics for voice response
   * @param {Object} metrics - The metrics object
   * @returns {string} Natural language summary
   */
  KanchoBusinessHealthMetrics.formatForVoice = (metrics) => {
    const healthDesc = KanchoBusinessHealthMetrics.getHealthDescription(metrics.health_score);

    let response = `Your business health score is ${metrics.health_score} out of 100, which is a grade ${metrics.health_grade}. `;
    response += `This means your business is ${healthDesc}. `;

    if (metrics.students_at_risk > 0) {
      response += `There are ${metrics.students_at_risk} students at risk, representing about $${Math.round(metrics.revenue_at_risk).toLocaleString()} in revenue. `;
    }

    if (metrics.hot_leads > 0) {
      response += `On the positive side, you have ${metrics.hot_leads} hot leads worth around $${Math.round(metrics.growth_potential).toLocaleString()} in potential growth. `;
    }

    response += `Monthly revenue is at $${Math.round(metrics.monthly_revenue).toLocaleString()}, which is ${Math.round(metrics.revenue_vs_target_percent)} percent of your target.`;

    return response;
  };

  return KanchoBusinessHealthMetrics;
};
