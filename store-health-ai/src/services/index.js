'use strict';

/**
 * Service Layer Index
 * Central export point for all business logic services
 */

const kpiCalculator = require('./kpi-calculator');
const thresholdChecker = require('./threshold-checker');
const alertManager = require('./alert-manager');
const escalationEngine = require('./escalation-engine');
const voiceCallManager = require('./voice-call-manager');

module.exports = {
  kpiCalculator,
  thresholdChecker,
  alertManager,
  escalationEngine,
  voiceCallManager
};
