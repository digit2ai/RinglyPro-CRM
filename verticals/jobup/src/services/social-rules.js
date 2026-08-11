'use strict';

/**
 * The "<platform posting rules config>" the spec left as a placeholder.
 *
 * Per-platform limits and capabilities, in one place, overridable by env so a
 * limit can move when Meta moves it without a redeploy.
 *
 * THE `supported` FLAG IS THE HONEST PART. Facebook's Groups API was
 * deprecated with Graph v19 (January 2024) and removed from ALL versions on
 * 22 April 2024 — `publish_to_groups` no longer exists, so no application can
 * publish to a Facebook Group programmatically, including this one. The spec
 * assumed HOA groups were reachable "with pre-authorized page access". They are
 * not. Rather than let a run quietly report zero posts, or worse invent one,
 * a group destination is marked `skipped` with that reason and handed back for
 * a human to post manually.
 */

const num = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

const PLATFORMS = {
  facebook_page: {
    label: 'Facebook Page',
    // The output schema only allows facebook | instagram | other.
    schema_platform: 'facebook',
    supported: true,
    caption_max: num(process.env.JOBUP_FB_CAPTION_MAX, 63206),
    formats: ['jpg', 'jpeg', 'png', 'gif'],
    max_bytes: num(process.env.JOBUP_FB_MAX_BYTES, 4 * 1024 * 1024),
    aspect_min: 0.1,
    aspect_max: 10,
    rate_delay_ms: num(process.env.JOBUP_FB_RATE_DELAY_MS, 1200),
    hashtag_style: 'inline',
  },
  instagram: {
    label: 'Instagram Business',
    schema_platform: 'instagram',
    supported: true,
    caption_max: num(process.env.JOBUP_IG_CAPTION_MAX, 2200),
    // Instagram's Content Publishing API accepts JPEG only. A PNG that Facebook
    // takes happily is rejected here, which is exactly the kind of
    // per-destination difference step 2 of the procedure exists to catch.
    formats: ['jpg', 'jpeg'],
    max_bytes: num(process.env.JOBUP_IG_MAX_BYTES, 8 * 1024 * 1024),
    aspect_min: 0.8,    // 4:5 portrait
    aspect_max: 1.91,   // 1.91:1 landscape
    rate_delay_ms: num(process.env.JOBUP_IG_RATE_DELAY_MS, 2000),
    hashtag_style: 'inline',
    hashtag_max: 30,
  },
  facebook_group: {
    label: 'Facebook Group (HOA, Chamber, community)',
    schema_platform: 'facebook',
    supported: false,
    unsupported_reason:
      'Facebook deprecated the Groups API in Graph v19 and removed it from all '
      + 'versions on 2024-04-22; the publish_to_groups permission no longer exists, '
      + 'so no application can post to a group. Post this one by hand.',
    caption_max: 63206,
    formats: ['jpg', 'jpeg', 'png', 'gif'],
    max_bytes: 4 * 1024 * 1024,
    aspect_min: 0.1,
    aspect_max: 10,
    rate_delay_ms: 0,
  },
  other: {
    label: 'Other channel',
    schema_platform: 'other',
    supported: false,
    unsupported_reason:
      'No connector is configured for this channel. Nothing was posted; the '
      + 'caption and image are returned for manual posting.',
    caption_max: 2200,
    formats: ['jpg', 'jpeg', 'png', 'gif'],
    max_bytes: 4 * 1024 * 1024,
    aspect_min: 0.1,
    aspect_max: 10,
    rate_delay_ms: 0,
  },
};

function forPlatform(platform) {
  return PLATFORMS[platform] || PLATFORMS.other;
}

/** The value allowed in the output schema's `platform` field. */
function schemaPlatform(platform) {
  return forPlatform(platform).schema_platform;
}

/**
 * Adapt a caption to a destination.
 *
 * TRUNCATION ONLY — never a rewrite. The constraint is that no claim, offer,
 * price or feature may appear that was not in the supplied copy, and the only
 * way to guarantee that in code rather than in a prompt is to never generate
 * text at all. Every character returned came from the input, so the result is
 * always a prefix of it (plus an ellipsis when cut).
 */
function adaptCaption(caption, platform) {
  const rules = forPlatform(platform);
  const text = String(caption == null ? '' : caption);
  if (text.length <= rules.caption_max) return { text, truncated: false };
  // Cut on a word boundary where one is close, so a sentence does not end
  // mid-word, then mark that it was shortened.
  const hard = rules.caption_max - 1;
  const slice = text.slice(0, hard);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > hard - 40 ? slice.slice(0, lastSpace) : slice;
  return { text: `${cut}…`, truncated: true };
}

/** Hashtags present in the caption, for the per-platform hashtag ceiling. */
function countHashtags(caption) {
  return (String(caption || '').match(/#[\wÀ-ɏ]+/g) || []).length;
}

module.exports = { PLATFORMS, forPlatform, schemaPlatform, adaptCaption, countHashtags };
