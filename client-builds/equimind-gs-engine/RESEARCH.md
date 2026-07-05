# RESEARCH.md — P5: Dynamic 4DGS & Animatable Horse Avatars (spike, not built)

Go/no-go on the v2 roadmap beyond static 3DGS. **Recommendation: GO on managed dynamic capture as a fast-follow; NO-GO (defer) on articulated horse avatars until it can ride a managed feed-forward video-to-4D API.**

## 1. Dynamic capture (4DGS) — moving horse/rider in a scene
| Approach | What it is | Fit for EquiMind | Cost signal |
|---|---|---|---|
| **FreeTimeGS / free-moving 4DGS** | Gaussians free to move & change over time; strong on general dynamic scenes | Best quality for a jumping round or a gaited pass in 3D+time | Self-hosted GPU training per clip (minutes–hours on an A100-class GPU) → high $ |
| **TrackerSplat-style tracked 4DGS** | Track points/gaussians across frames | Good for stride/limb trajectories overlaid on the splat | Similar GPU cost |
| **L4GM-class feed-forward video→4D** | A model that emits 4D from a short video in one pass (seconds), no per-scene training | The unlock: turns 4D into an API call, not a GPU job | Cheap per call *if* offered as a managed API |

**Verdict:** the moment an L4GM-class **managed API** is available, dynamic capture becomes a `ProcessingProvider` swap (the interface already supports it). Until then, self-hosted 4DGS training is too costly per scene for the credit model. **GO, gated on a managed 4D API (track quarterly).**

## 2. Animatable/re-poseable horse avatars
| Building block | Role | Maturity for equine |
|---|---|---|
| **SMAL** (quadruped parametric template) | Rig/shape prior for four-legged animals incl. horses | Usable but coarse for breed-specific conformation |
| **GART-style articulated Gaussians** | Bind gaussians to a skeleton so the avatar re-poses | Proven on humans (GART/animatable 3DGS); quadruped adaptation is research-grade |
| **Video → articulated avatar** | Feed-forward fitting of the template to a capture | Not yet a robust managed product for horses |

**Verdict:** re-poseable horse avatars (drive a captured horse into a new gait/pose) need SMAL-fit + articulated-gaussian training per subject — heavy, research-grade, no managed path today. **NO-GO for now; revisit when a managed "video → rigged quadruped gaussian" API appears.** A cheaper interim: static conformation splat + measurement overlays (already shippable in P3).

## 3. Recommended v2 architecture
Keep the `ProcessingProvider` interface. Add:
- `provider.kind` = `static_3dgs` (v1) | `dynamic_4dgs` (v2a, managed API when available) | `avatar_4d` (v2b, deferred).
- A `gs_scenes.temporal` JSONB (frame count, fps, duration) for 4D playback; viewer gains a timeline scrubber.
- Cost model: 4D at ~3–6× the per-minute credit rate of static (GPU time scales with frames). Gate premium tiers.

## 4. Cost estimate (order of magnitude, self-hosted 4D)
- Static 3DGS (managed, v1): ~$0.30–$0.80 / scene → margin-positive at list pricing (see pricing.js).
- Dynamic 4DGS (self-hosted training): ~$3–$15 / 10-second clip on spot GPUs today → **negative margin at current list**; needs managed feed-forward pricing to be viable.
- Avatar 4D: not estimable as a product yet (bespoke per subject).

**Bottom line:** the interface is 4D-ready; the economics are not, until managed 4D APIs mature. Ship static now, watch the API market, flip the provider when the numbers work.
