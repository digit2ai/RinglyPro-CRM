'use strict';

/** Fixed vocabularies. Code compares against these; a model may never add to them. */

const CAMPAIGN_STATUSES = ['draft', 'pending_approval', 'approved', 'active', 'paused', 'completed', 'cancelled'];
// Who may move a campaign where. Activation is a separate, explicit act.
const CAMPAIGN_TRANSITIONS = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['active', 'draft', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'completed', 'cancelled'],
  completed: [],
  cancelled: []
};

const CALL_OUTCOMES = [
  'no_answer', 'voicemail', 'not_interested', 'call_back_later', 'interested', 'needs_pricing',
  'needs_product_information', 'needs_inventory_information', 'potential_buyer', 'transfer_requested',
  'transferred', 'do_not_call'
];
// Outcomes that mean commercial interest -> a Potential Buyer is created/updated.
const BUYER_OUTCOMES = new Set(['interested', 'needs_pricing', 'needs_product_information', 'needs_inventory_information', 'potential_buyer', 'transfer_requested', 'transferred']);

const PIPELINE = [
  'target_contractor', 'outbound_scheduled', 'outbound_attempted', 'connected', 'interested', 'potential_buyer',
  'pricing_requested', 'quote_requested', 'transferred_to_sales', 'quote_sent', 'negotiation', 'won', 'lost',
  'callback_required', 'do_not_contact'
];
// Stage an EVENT may set automatically. Anything not here moves only by a person.
const OUTCOME_STAGE = {
  no_answer: 'outbound_attempted', voicemail: 'outbound_attempted', not_interested: 'connected',
  call_back_later: 'callback_required', interested: 'interested', needs_pricing: 'pricing_requested',
  needs_product_information: 'interested', needs_inventory_information: 'interested', potential_buyer: 'potential_buyer',
  transfer_requested: 'transferred_to_sales', transferred: 'transferred_to_sales', do_not_call: 'do_not_contact'
};
// Automatic moves never go BACKWARD past a human stage: once a person has a
// quote out or a deal won, a later "no answer" must not demote it.
const HUMAN_STAGES = new Set(['quote_sent', 'negotiation', 'won', 'lost']);

const DEFAULT_CATEGORIES = [
  ['General Contractors', 'general contractor,construction,build,renovation,framing,drywall,flooring,cabinet,door,trim,window,roof,lumber,concrete'],
  ['Remodeling Companies', 'remodel,renovation,flooring,vinyl,tile,cabinet,countertop,trim,door,paint,drywall,fixture,faucet,vanity'],
  ['Flooring Contractors', 'floor,flooring,vinyl,lvp,lvt,laminate,hardwood,tile,carpet,underlayment,grout,transition,subfloor'],
  ['Kitchen Remodelers', 'kitchen,cabinet,countertop,quartz,granite,backsplash,sink,faucet,range hood,tile'],
  ['Bathroom Remodelers', 'bath,bathroom,vanity,shower,tub,toilet,tile,grout,faucet,mirror,backer board'],
  ['Interior Contractors', 'interior,drywall,trim,molding,door,paint,ceiling,flooring,insulation'],
  ['Painters', 'paint,primer,stain,caulk,brush,roller,sprayer,drop cloth,sealer'],
  ['Plumbers', 'pipe,pex,pvc,copper,fitting,valve,faucet,toilet,water heater,drain,plumbing'],
  ['Roofers', 'roof,shingle,underlayment,flashing,gutter,drip edge,ridge vent,roofing nail'],
  ['Carpenters', 'lumber,trim,molding,door,stair,baseboard,casing,wood,plywood,framing,hardware'],
  ['Builders', 'lumber,concrete,rebar,window,door,roof,insulation,drywall,framing,siding,flooring'],
  ['Property Renovation Companies', 'renovation,flooring,vinyl,paint,cabinet,fixture,door,trim,appliance,countertop'],
  ['Interior Designers', 'tile,countertop,fixture,lighting,flooring,hardware,cabinet,decor'],
  ['Landscapers', 'paver,stone,mulch,sod,irrigation,retaining wall,edging,gravel,landscape']
];

const DEFAULT_COMPETITORS = ['Home Depot', "Lowe's", 'Local Hardware Stores', 'Regional Building Suppliers'];

module.exports = { CAMPAIGN_STATUSES, CAMPAIGN_TRANSITIONS, CALL_OUTCOMES, BUYER_OUTCOMES, PIPELINE, OUTCOME_STAGE, HUMAN_STAGES, DEFAULT_CATEGORIES, DEFAULT_COMPETITORS };
