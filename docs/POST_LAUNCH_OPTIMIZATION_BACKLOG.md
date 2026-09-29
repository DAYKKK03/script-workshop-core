# Post-Launch Optimization Backlog

This backlog records improvements that should wait until the core Douyin extraction flow is working in production. None of these items is part of P1-21.5Q.

## 1. Prove COS Relay Compatibility End to End

- **Design rationale:** The least certain boundary is still whether Volcengine ASR can reliably fetch the stable COS object URL after relay configuration is enabled.
- **User impact:** A successful cut-test turns the current architecture from a tested implementation into a proven extraction path. A failure gives one precise provider boundary to fix.
- **Capability boundary:** Unit tests prove request construction, cleanup, and failure handling; they do not prove real COS upload, anonymous read, or Volcengine fetch behavior.
- **Trigger condition:** Run after staging has the dedicated COS prefix, scoped credentials, public read policy, and one-day lifecycle fallback.

## 2. Keep Third-Party Media Handoff as a First-Class Risk

- **Design rationale:** Earlier investigation concentrated on TikHub and Volcengine credentials, but the central architecture problem is that a third-party video URL cannot be assumed to be directly readable by an ASR provider.
- **User impact:** Treating the handoff as its own boundary avoids repeated generic extraction failures and shortens incident diagnosis.
- **Capability boundary:** The relay stabilizes authorized media delivery; it does not bypass Douyin access controls or guarantee that every upstream media object contains usable speech.
- **Trigger condition:** Revisit whenever ASR succeeds with official sample audio but fails with relayed Douyin media.

## 3. Monitor Likely Three-Month Failure Modes

- **Design rationale:** TikHub response structures, Douyin CDN anti-hotlink behavior, and COS or ASR access policies can change independently.
- **User impact:** Early detection prevents a provider contract change from becoming a broad user-facing outage.
- **Capability boundary:** Monitoring can identify contract drift but cannot prevent external providers from changing or withdrawing capabilities.
- **Trigger condition:** Review after any provider release, sustained extraction error increase, media candidate path change, or COS/ASR authorization failure.

## 4. Add Explainable Script Quality Scoring

- **Design rationale:** After extraction reliability is proven, the strongest product improvement is a script decomposition quality score with specific, explainable recommendations.
- **User impact:** Users can understand why a script is weak and what to improve instead of receiving only generated output.
- **Capability boundary:** Scoring should evaluate structure and evidence from the selected merchant profile; it must not invent business facts or promise performance outcomes.
- **Trigger condition:** Start only after the extraction-to-generation success rate is stable and representative scripts are available for evaluation.

## 5. Standardize External-Service Delivery Rounds

- **Design rationale:** Each round should have one target, use `PASS` / `BLOCKED` / `FAILED`, run provider cut-tests before full integration, follow a fixed evidence checklist, and keep execution separate from acceptance.
- **User impact:** The user receives faster, clearer decisions with less repeated testing and fewer ambiguous partial-success claims.
- **Capability boundary:** The process improves evidence quality but cannot replace missing credentials, console permissions, or real provider availability.
- **Trigger condition:** Apply to every new provider integration, credential rotation, deployment-path change, and production incident.
