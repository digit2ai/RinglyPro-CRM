'use strict';

/**
 * THE AI READINESS DEPARTMENT — the crew, registered on one Brain.
 *
 * Five agents. One of them leads; three answer one fear each; the fifth turns
 * their findings into the thing the CEO takes away.
 *
 *   Readiness Director   orchestrates, interviews, assembles
 *   Cost Comfort Agent   the fear of cost
 *   Risk Comfort Agent   the fear of risk
 *   Data Readiness Agent the fear that the data is not good enough
 *   Roadmap Builder      the three-phase roadmap and the scorecard
 *
 * Registering an agent here makes its tools available on every channel at
 * once — the sponsor console, a voice orb, an external MCP client — with
 * authorization, tenancy, budget and audit already in front of them. There is
 * deliberately no second place to declare a capability.
 */

const { DepartmentBrain } = require('./brain');

const AGENTS = [
  require('./agents/readiness-director'),
  require('./agents/cost-comfort'),
  require('./agents/risk-comfort'),
  require('./agents/data-readiness'),
  require('./agents/roadmap-builder')
];

const brain = new DepartmentBrain({ agents: AGENTS });

module.exports = { brain, AGENTS };
