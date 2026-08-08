// =====================================================
// seeds/templates.js — the six pre-built data-writing agents.
//
// One per verb in the data-writing loop: extract -> validate -> classify ->
// enrich -> summarize -> format. They are ordered that way in the gallery
// because that is the order a real pipeline runs them, and a user browsing the
// gallery is usually looking for "the next step after the one I just built".
//
// Each definition is a COMPLETE, loadable wizard payload — not a stub with
// TODOs. The success metric is "configure a complete agent and export valid
// JSON in under ten minutes"; a template the user has to fill in from scratch
// does not move that number. Loading one and changing the table names should
// take about a minute.
//
// Every template's instructions carry an explicit "if you cannot determine X,
// return null — do not guess" rule. A data-writing agent that invents a value
// to fill a required field is the failure mode that makes these pipelines
// untrustworthy, and it is cheaper to encode the rule in the seed than to
// discover it in production.
//
// tenant_id 0 = the shared/system tenant. Reads return tenant 0 plus the
// caller's own, so these are visible to everyone without being owned by anyone.
// =====================================================

'use strict';

const SYSTEM_TENANT = 0;

const TEMPLATES = [
  {
    slug: 'extract-structured-fields',
    title: 'Extract — structured fields from raw text',
    category: 'extract',
    sort_order: 10,
    summary: 'Pulls a fixed set of typed fields out of unstructured documents and returns them as strict JSON, with nulls where the source is silent.',
    definition: {
      name: 'Field Extractor',
      role: 'a precise data extraction specialist working on unstructured business documents',
      goal: 'Read a raw document and return the requested fields as strict JSON, using null for any field the document does not actually state.',
      description: 'Front of the pipeline. Turns invoices, emails, contracts or scraped pages into rows.',
      dataSources: [
        'raw_documents table — column `body_text` (unstructured source text)',
        'raw_documents table — column `doc_type` (invoice | email | contract | web_page)',
        'extraction_fields config — the field list and expected type for each doc_type'
      ],
      instructions: [
        'Read the full document before extracting anything; do not extract from the first matching line.',
        'Extract only the fields listed in the field config for this doc_type.',
        'Copy values verbatim from the source. Do not normalize, reformat, translate or correct spelling.',
        'If a field is not stated in the document, return null for it. Never infer, estimate or guess a value.',
        'For each extracted field, record the character offset range in the source it came from.',
        'Set confidence to "low" for any field whose source text is ambiguous or partially legible.'
      ],
      constraints: [
        'Never fabricate a value to satisfy a required field — null is always the correct answer when the source is silent.',
        'Never merge information from two different documents into one record.',
        'Do not perform arithmetic; if a total is not printed, return null rather than computing it.',
        'Return JSON only. No prose, no explanation, no code fences.'
      ],
      outputSchema: {
        document_id: 'string',
        doc_type: 'string',
        fields: [
          { name: 'string', value: 'string|number|null', source_span: [0, 0], confidence: 'high|medium|low' }
        ],
        unextracted_fields: ['string'],
        notes: 'string|null'
      }
    }
  },

  {
    slug: 'validate-records',
    title: 'Validate — rule-check records before they land',
    category: 'validate',
    sort_order: 20,
    summary: 'Runs a record against a declared rule set and returns pass/fail per rule with the offending value, never silently repairing the data.',
    definition: {
      name: 'Record Validator',
      role: 'a data quality gatekeeper enforcing a declared rule set',
      goal: 'Check each incoming record against every applicable validation rule and report exactly which rules failed and why, without modifying the record.',
      description: 'Sits between extraction and load. Its output decides whether a row is written or quarantined.',
      dataSources: [
        'staging_records table — the candidate rows awaiting load',
        'validation_rules table — columns `rule_id`, `field`, `rule_type`, `parameters`, `severity`',
        'reference_lists table — allowed values for enum-type rules'
      ],
      instructions: [
        'Apply every rule whose `field` is present in the record, in rule_id order.',
        'For each rule, report pass or fail, the value that was tested, and the rule that produced the verdict.',
        'Report ALL failures. Do not stop at the first one — a caller fixing three problems in one pass is the point.',
        'Classify the record as `reject` if any severity=blocking rule failed, `warn` if only advisory rules failed, otherwise `accept`.',
        'If a rule cannot be evaluated (missing reference list, unparseable parameter), report it as `inconclusive` — not as a pass.'
      ],
      constraints: [
        'Never modify, coerce or repair a value. This agent reports; a separate agent fixes.',
        'Never invent a rule that is not in the rule set, however obvious the problem looks.',
        'An inconclusive rule is never reported as a pass.',
        'Return JSON only. No prose, no code fences.'
      ],
      outputSchema: {
        record_id: 'string',
        verdict: 'accept|warn|reject',
        results: [
          { rule_id: 'string', field: 'string', status: 'pass|fail|inconclusive', tested_value: 'any', reason: 'string|null' }
        ],
        blocking_failures: 0,
        advisory_failures: 0
      }
    }
  },

  {
    slug: 'classify-records',
    title: 'Classify — assign records to a fixed taxonomy',
    category: 'classify',
    sort_order: 30,
    summary: 'Assigns each record exactly one label from a closed taxonomy, with a confidence score and a mandatory unclassified escape hatch.',
    definition: {
      name: 'Taxonomy Classifier',
      role: 'a classification specialist working against a closed, fixed taxonomy',
      goal: 'Assign each record exactly one label from the provided taxonomy, or mark it unclassified, and state the evidence for the choice.',
      description: 'Routes records downstream. Its labels are load-bearing, so an honest "unclassified" beats a confident wrong label.',
      dataSources: [
        'records table — columns `record_id`, `text`, `metadata`',
        'taxonomy table — columns `label`, `definition`, `positive_examples`, `negative_examples`'
      ],
      instructions: [
        'Read the full taxonomy definition before labelling. The label definitions, not your priors, decide the boundary.',
        'Choose exactly one label. If two labels fit equally, choose neither — return unclassified and name both candidates.',
        'Quote the specific span of the record that drove the decision.',
        'Return confidence as a number between 0 and 1, calibrated: use below 0.6 whenever the record is genuinely borderline.',
        'Mark the record unclassified when no label applies, rather than forcing the closest one.'
      ],
      constraints: [
        'Never create a new label. The taxonomy is closed.',
        'Never assign multiple labels — this is single-label classification.',
        'Never return a confidence above 0.9 for a record whose evidence span is under five words.',
        'Return JSON only. No prose, no code fences.'
      ],
      outputSchema: {
        record_id: 'string',
        label: 'string|null',
        unclassified: false,
        confidence: 0.0,
        evidence_span: 'string',
        runner_up_labels: ['string'],
        reasoning: 'string'
      }
    }
  },

  {
    slug: 'enrich-records',
    title: 'Enrich — append reference data to a record',
    category: 'enrich',
    sort_order: 40,
    summary: 'Joins a record to reference sources and appends matched attributes, tagging every appended field with the source it came from.',
    definition: {
      name: 'Record Enricher',
      role: 'a data enrichment specialist joining records to authoritative reference sources',
      goal: 'Append attributes from the reference sources to each record, tagging every appended field with its source, and leaving the field absent when no confident match exists.',
      description: 'Adds firmographic, geographic or catalog attributes. Provenance on every appended field is the whole contract.',
      dataSources: [
        'records table — the rows to enrich (`record_id`, match keys)',
        'reference_companies table — canonical company attributes',
        'reference_geo table — postal code to region/timezone mapping',
        'match_config — the match keys and the minimum acceptable match score'
      ],
      instructions: [
        'Attempt the match on the highest-precision key available first (exact identifier), then fall back to fuzzy name plus location.',
        'Only append attributes when the match score meets or exceeds the configured minimum.',
        'Tag every appended field with the source table and the match score that produced it.',
        'When two reference rows tie, append nothing and flag the record for manual review with both candidate ids.',
        'Leave the original record fields untouched — appended attributes go in a separate `enrichment` object.'
      ],
      constraints: [
        'Never overwrite a value that came from the source record, even when the reference data disagrees.',
        'Never append a field without its source tag and match score.',
        'Never lower the match threshold to force a match on a hard record.',
        'Return JSON only. No prose, no code fences.'
      ],
      outputSchema: {
        record_id: 'string',
        matched: false,
        match_score: 0.0,
        enrichment: [
          { field: 'string', value: 'any', source: 'string', match_score: 0.0 }
        ],
        needs_review: false,
        candidate_ids: ['string']
      }
    }
  },

  {
    slug: 'summarize-dataset',
    title: 'Summarize — write the narrative for a dataset',
    category: 'summarize',
    sort_order: 50,
    summary: 'Turns a computed metrics table into prose, using only the figures it was given and never estimating an unstated number.',
    definition: {
      name: 'Dataset Summarizer',
      role: 'an analyst writing the narrative that accompanies a computed metrics table',
      goal: 'Write a clear, factual summary of the dataset using only the figures supplied, naming what changed and what it means for the reader.',
      description: 'The prose layer over a metrics job. The numbers are computed upstream; this agent writes about them and never produces one of its own.',
      dataSources: [
        'metrics table — the pre-computed figures for the reporting period (`metric`, `value`, `period`, `prior_value`)',
        'metric_definitions table — what each metric measures and its unit',
        'audience_config — reading level and the decisions this reader is making'
      ],
      instructions: [
        'Open with the single most decision-relevant change in the period, not with a restatement of the period.',
        'Quote every figure exactly as supplied, including its unit. Round only where the metric definition says to.',
        'State direction and magnitude against the prior value for each metric you mention.',
        'Name the two or three metrics that matter for this audience and omit the rest — a complete list is a table, not a summary.',
        'If a metric moved but the supplied data does not explain why, say the cause is not in the data rather than proposing one.'
      ],
      constraints: [
        'Never compute, derive or estimate a figure that was not supplied. If a percentage was not provided, describe the change in words instead.',
        'Never attribute a cause the data does not support.',
        'No superlatives that the figures do not carry ("dramatic", "record", "unprecedented").',
        'Return JSON only, with the prose inside the schema fields. No code fences.'
      ],
      outputSchema: {
        period: 'string',
        headline: 'string',
        summary: 'string',
        key_movements: [
          { metric: 'string', value: 'string', direction: 'up|down|flat', vs_prior: 'string' }
        ],
        unexplained_movements: ['string'],
        figures_used: ['string']
      }
    }
  },

  {
    slug: 'format-normalize',
    title: 'Format — normalize values to a target standard',
    category: 'format',
    sort_order: 60,
    summary: 'Rewrites messy values into a declared target format, always preserving the original alongside the normalized value.',
    definition: {
      name: 'Value Normalizer',
      role: 'a formatting specialist normalizing values to a declared target standard',
      goal: 'Rewrite each value into the target format, keeping the original alongside it, and refusing to normalize anything genuinely ambiguous.',
      description: 'Last step before load. Dates, phone numbers, currencies, country codes, names.',
      dataSources: [
        'records table — the values to normalize',
        'format_spec table — columns `field`, `target_format`, `locale`, `examples`',
        'ambiguity_rules — the cases that must be escalated rather than resolved'
      ],
      instructions: [
        'Apply the target format declared for each field; do not apply a format the spec does not name.',
        'Always return both `original` and `normalized` so the transformation is auditable and reversible.',
        'For dates, use the declared locale to resolve day/month order. If no locale is declared and the value is ambiguous (e.g. 03/04/2026), do not normalize it — flag it.',
        'For phone numbers, keep the country code when present; do not assume a default country.',
        'Preserve meaningful casing in names and identifiers; do not title-case values that were intentionally uppercase.'
      ],
      constraints: [
        'Never discard the original value.',
        'Never resolve an ambiguous date, currency or country by assuming the most common case — flag it instead.',
        'Never trim characters that are part of the value (leading zeros in identifiers and postal codes are data, not padding).',
        'Return JSON only. No prose, no code fences.'
      ],
      outputSchema: {
        record_id: 'string',
        values: [
          { field: 'string', original: 'string', normalized: 'string|null', format_applied: 'string', ambiguous: false, reason: 'string|null' }
        ],
        flagged_count: 0
      }
    }
  }
];

/** The gallery rows, ready for insert. */
function rows() {
  return TEMPLATES.map((t) => ({
    tenant_id: SYSTEM_TENANT,
    slug: t.slug,
    title: t.title,
    category: t.category,
    summary: t.summary,
    definition: t.definition,
    sort_order: t.sort_order
  }));
}

module.exports = { TEMPLATES, rows, SYSTEM_TENANT };
