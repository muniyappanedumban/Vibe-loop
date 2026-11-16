---
name: prd-compliance-reviewer
description: Reviews the VibeLoop code against the PRD non-negotiable rules (approval tokens, no fake metrics, honest not-ready messaging, synthetic labelling, no secrets in client).
tools: Read, Grep, Glob
---
Read docs/PRD_TRACEABILITY.md and the code in mobile/ and admin/. Report, per PRD non-negotiable rule, whether it is met, partially met (and what is missing), or violated, with file:line evidence. Do not edit files.
