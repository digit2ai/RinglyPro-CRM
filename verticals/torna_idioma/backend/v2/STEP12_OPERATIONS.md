# Step 12 — Operations Runbook

## What Step 12 actually is

Step 12 adds **three production-grade capabilities** to Torna Idioma v2, each of which requires real money and human work that cannot be executed autonomously by an agent:

1. **Proprietary fine-tuned LLM** for Profesora Isabel (replaces Claude for hot-path chat)
2. **Custom ElevenLabs voice clones** ("Ate Maria", "Kuya Diego")
3. **Ultra-premium voice selection** in the learner UI

The code scaffolding is **already deployed**. The system gracefully falls back to existing Claude + default Rachel voice when the proprietary components are not yet configured, so nothing is broken.

This runbook tells you what to do when budget and people are ready.

---

## 1. Proprietary Fine-Tuned LLM

### Status
**Scaffolded, not trained.** Endpoint code is live at `/api/v2/isabel/chat?model=proprietary` but returns 503 when `TI_V2_PROPRIETARY_MODEL_ENDPOINT` is not set, falls through to Claude.

### Step-by-step activation

#### A. Export training data from production
```bash
# Admin-only endpoint. Streams a Hugging Face-compatible .jsonl
curl -H "Authorization: Bearer ${ADMIN_JWT}" \
  https://aiagent.ringlypro.com/Torna_Idioma/api/v2/training-data/export.jsonl \
  -o torna-idioma-isabel-v1.jsonl

# Check stats first:
curl -H "Authorization: Bearer ${ADMIN_JWT}" \
  https://aiagent.ringlypro.com/Torna_Idioma/api/v2/training-data/stats
```

The exported corpus contains:
- **576 cognate pairs × 2 directions** = 1,152 cognate Q&A examples
- **72 UVEG lessons × 3 exercises avg** = ~216 exercise examples  
- **72 UVEG lessons as teaching dialogues** = 72 lesson examples
- **All real learner-Isabel conversation turn pairs** collected to date

Roughly **1,500-2,500 training examples** depending on how much real conversation history has accumulated.

#### B. Choose a base model and host

Recommended options, cheapest first:

| Base model | Parameters | Spot GPU | Hourly cost | Why |
|---|---|---|---|---|
| `mistralai/Mistral-7B-Instruct-v0.3` | 7B | A10 (24GB) | $0.40 | Best Spanish baseline at 7B |
| `Qwen/Qwen2.5-7B-Instruct` | 7B | A10 | $0.40 | Stronger multilingual, newer |
| `meta-llama/Llama-3.1-8B-Instruct` | 8B | A10 | $0.50 | Most ecosystem support |

#### C. Fine-tune with LoRA

Use `axolotl` (easiest) or `trl` for the LoRA training:

```yaml
# axolotl config: torna-idioma-isabel.yml
base_model: mistralai/Mistral-7B-Instruct-v0.3
adapter: lora
lora_r: 16
lora_alpha: 32
lora_dropout: 0.05
lora_target_linear: true

datasets:
  - path: torna-idioma-isabel-v1.jsonl
    type: chat_template
    chat_template: chatml

num_epochs: 3
learning_rate: 2e-4
sequence_len: 2048
micro_batch_size: 2
gradient_accumulation_steps: 4
warmup_steps: 50

output_dir: ./torna-idioma-isabel-v1
```

**Expected cost:** ~$45 on RunPod / Lambda Labs spot A10 instance, ~8-12 hours.

#### D. Deploy the trained model

Three hosting options in order of cost:

| Host | Cost | Latency | Notes |
|---|---|---|---|
| **together.ai dedicated** | ~$0.20/hr | 200-500ms | Easiest, OpenAI-compatible API |
| **HF Inference Endpoints** | ~$0.60/hr (A10) | 300-800ms | Auto-scaling, private |
| **Self-hosted vLLM** | GPU rental | 100-300ms | Cheapest at scale, more ops work |

All three expose `/v1/chat/completions` endpoints.

#### E. Activate in production

Set Render environment variables on the Torna Idioma service:

```bash
TI_V2_PROPRIETARY_MODEL_ENDPOINT=https://api.together.xyz/v1/chat/completions
TI_V2_PROPRIETARY_MODEL_KEY=<your-together-ai-key>
TI_V2_PROPRIETARY_MODEL_NAME=your-username/torna-idioma-isabel-v1
```

Redeploy. Verify:

```bash
curl https://aiagent.ringlypro.com/Torna_Idioma/api/v2/isabel/status | jq .models.proprietary
# Expect: { configured: true, endpoint: "api.together.xyz", model_name: "..." }
```

Test a chat with the proprietary model:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"¡Hola Profesora!","model":"proprietary"}' \
  https://aiagent.ringlypro.com/Torna_Idioma/api/v2/isabel/chat
```

The response `model` field will show your fine-tuned model name instead of `claude-opus-4-20250514`.

#### F. Graceful fallback

If the proprietary endpoint goes down (model crash, quota, etc.), `isabel-llm.js` automatically falls through to Claude → GPT-4o → mock. The user sees no interruption; the failure is logged to `ti_v2_isabel_conversations.metadata.fallback`.

---

## 2. Custom Voice Clones (Ate Maria / Kuya Diego)

### Status
**Wired, not commissioned.** The voice picker in the learner profile works, the database field `voice_preference` is queried on every voice exchange, but both "Ate Maria" and "Kuya Diego" currently point to the default Rachel voice via fallback.

### Step-by-step activation

#### A. Subscribe to ElevenLabs Creator or Pro

- **Creator:** $22/mo — 3 custom Instant Voice Clones (lower quality, 1-minute samples)
- **Pro:** $99/mo — Professional Voice Clones (higher quality, 30-min samples required) ← **recommended**

#### B. Record voice samples

For each persona, record **30 minutes** of clean speech from a native speaker:

**Ate Maria** — warm Filipina woman, Latin American Spanish accent
- Script: Mix of A1-B1 Spanish teaching dialogue + Filipino filler sounds ("oo nga", "ay naku", "mi apo")
- Recording: Studio mic, quiet room, 44.1kHz+, WAV
- Voice actor: Filipina native Spanish speaker or trained ESL teacher with Latin American accent training

**Kuya Diego** — young Filipino man, energetic, Latin American accent
- Script: Conversational Spanish with BPO context (customer service scenarios, technical terms)
- Voice actor: Filipino male with Mexican Spanish training (many BPO trainers fit)

Expected cost: **$150-$500 per voice** for professional recording session.

#### C. Upload to ElevenLabs Professional Voice Clone

Via ElevenLabs dashboard → Voice Library → Add Voice → Professional Voice Clone. Upload the 30-minute sample. Wait 4-8 hours for training.

You'll get back a `voice_id` like `pNInz6obpgDQGcFmaJgB`.

#### D. Activate in production

Set Render environment variables:

```bash
TI_V2_ELEVENLABS_VOICE_ATE_MARIA=<voice_id_from_elevenlabs>
TI_V2_ELEVENLABS_VOICE_KUYA_DIEGO=<voice_id_from_elevenlabs>
```

Redeploy. Verify:

```bash
curl https://aiagent.ringlypro.com/Torna_Idioma/api/v2/conversation/status | jq .voice_library
# Expect: { ate_maria: { id: "...", custom: true }, kuya_diego: { id: "...", custom: true } }
```

#### E. Learner selection flow

Learners pick their preferred voice in `/Torna_Idioma/learn` profile settings (the `voice_preference` dropdown already exists — see `LearnerHome.jsx` edit form). Their choice persists in `ti_v2_learners.voice_preference` and is applied automatically in every `/api/v2/conversation/exchange` call.

If a learner picks "Ate Maria" but the env var is not set, they hear the default Isabel voice with no error — graceful degradation.

---

## 3. Cost Summary

| Item | One-time | Recurring |
|---|---|---|
| Fine-tune training run | $45 | — |
| Proprietary model hosting (together.ai) | — | ~$150/mo (500 req/hr) |
| ElevenLabs Pro | — | $99/mo |
| Ate Maria voice session | $150-$500 | — |
| Kuya Diego voice session | $150-$500 | — |
| **Minimum total to activate** | **$345** | **$249/mo** |
| **Realistic total** | **$1,045** | **$249/mo** |

---

## 4. Validation Checklist

After activation, verify:

- [ ] `GET /api/v2/isabel/status` shows all 3 models configured
- [ ] `?model=proprietary` chat returns with `model: "torna-idioma-isabel-v1"` in response
- [ ] Claude fallback still works (set temporary broken proprietary endpoint, verify chat still responds)
- [ ] `GET /api/v2/conversation/status` shows `voice_library.ate_maria.custom: true`
- [ ] Learner with `voice_preference = "ate_maria"` hears the custom voice in `/learn/voice`
- [ ] Regression check still passes for all 7 verticals

---

## 5. What NOT to do

- **Do not train on student PII.** The training data exporter includes real learner-Isabel conversations. Before fine-tuning, review the `real_conversation` entries in the exported JSONL and strip any personal identifiers (names, phone numbers, addresses). This is important for GDPR/Philippine Data Privacy Act compliance.
- **Do not use the free ElevenLabs tier for voice clones.** Voice quality is noticeably worse and the clones can hallucinate mid-sentence.
- **Do not self-host the fine-tuned model without monitoring.** GPU OOM crashes take down Isabel silently. If you self-host, add a health check endpoint and wire it into `scripts/regression-check.sh`.
