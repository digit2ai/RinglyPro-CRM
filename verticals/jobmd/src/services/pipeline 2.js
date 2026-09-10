'use strict';

/**
 * THE RECRUITMENT PIPELINE.
 *
 * The thirteen stages and the agent authority allow-list are read from
 * corpus.js, so the running state machine and the published architecture
 * document are the same list. An agent cannot move a candidate to Offer here
 * for exactly the reason the document says it cannot: the project request
 * never authorised it.
 *
 * People (recruiters, hospital users, administrators) may move a candidate to
 * any stage. An AGENT may only set the four stages its own named function
 * produces. That asymmetry is the whole point — automation assists, it does
 * not decide who gets an offer.
 */

const C = require('./corpus');

const STAGES = C.RECRUITMENT_PIPELINE.map(function (s) { return s.stage; });

const AGENT_AUTHORITY = {};
C.RECRUITMENT_PIPELINE.forEach(function (s) {
  s.agents_authorized_to_update.forEach(function (a) {
    (AGENT_AUTHORITY[a] = AGENT_AUTHORITY[a] || []).push(s.stage);
  });
});

function isStage(s) { return STAGES.indexOf(s) !== -1; }
function stageIndex(s) { return STAGES.indexOf(s); }

/**
 * May this actor set this stage?
 * @param {'person'|'agent'} actorKind
 * @param {string} actor  account id as text, or the agent's exact name
 */
function canSet(actorKind, actor, stage) {
  if (!isStage(stage)) return { allowed: false, reason: '"' + stage + '" is not one of the thirteen stages.' };
  if (actorKind === 'person') return { allowed: true, reason: null };
  if (actorKind !== 'agent') return { allowed: false, reason: 'Unknown actor kind "' + actorKind + '".' };

  const known = C.AGENTS.map(function (a) { return a.name; });
  if (known.indexOf(actor) === -1) {
    return { allowed: false, reason: '"' + actor + '" is not one of the eleven agents.' };
  }
  const allowed = AGENT_AUTHORITY[actor] || [];
  if (allowed.indexOf(stage) === -1) {
    return { allowed: false,
             reason: '"' + actor + '" is not authorized to set "' + stage + '". ' +
                     (allowed.length ? 'It may set: ' + allowed.join(', ') + '.'
                                     : 'It may not set any stage; only people can.') };
  }
  return { allowed: true, reason: null };
}

/** Stages a person may choose from the UI, in order. */
function stagesForPerson() { return STAGES.slice(); }

/** What an agent is allowed to set, for display. */
function agentAuthorityTable() {
  return C.AGENTS.map(function (a) {
    return { agent: a.name, maySet: (AGENT_AUTHORITY[a.name] || []).slice() };
  });
}

module.exports = { STAGES, AGENT_AUTHORITY, canSet, isStage, stageIndex, stagesForPerson, agentAuthorityTable };
