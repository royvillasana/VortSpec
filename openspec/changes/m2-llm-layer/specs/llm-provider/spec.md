## ADDED Requirements

### Requirement: LLM provider interface
The system SHALL provide an `LLMProvider` module in `packages/llm` that abstracts LLM calls behind a provider-agnostic interface. The default implementation SHALL use OpenRouter's OpenAI-compatible API.

#### Scenario: Complete a text prompt
- **WHEN** `llmComplete(systemPrompt, userPrompt)` is called
- **THEN** the system SHALL try models in cascade order (free first, then cheap)
- **AND** return `{ content, model, tokensIn, tokensOut }`

#### Scenario: Complete with structured JSON output
- **WHEN** `llmJSON(systemPrompt, userPrompt, validator)` is called
- **THEN** the response SHALL be parsed as JSON and validated against the provided validator
- **AND** if validation fails, the system SHALL retry once with the validation error appended

#### Scenario: All models fail
- **WHEN** every model in the cascade returns an error or empty response
- **THEN** the system SHALL throw an error with a clear message

### Requirement: Model cascade
The provider SHALL try models in this order: free models first (Gemini Flash free, Llama free), then cheap paid models (Gemini Flash paid, Claude Sonnet). The cascade SHALL stop at the first successful response.

#### Scenario: Free model succeeds
- **WHEN** the first free model returns a valid response
- **THEN** no paid models SHALL be called

#### Scenario: Free models fail, paid model succeeds
- **WHEN** all free models fail but a paid model succeeds
- **THEN** the paid model's response SHALL be returned

### Requirement: Usage metering
Every LLM call SHALL log usage to the `llm_usage` table with: project_id, provider, model, tokens_in, tokens_out, purpose.

#### Scenario: Metering recorded
- **WHEN** an LLM call completes successfully
- **THEN** a row SHALL be inserted into `llm_usage` with the model used, token counts, and purpose string

### Requirement: Temperature zero for determinism
All pipeline LLM calls SHALL use temperature 0 to ensure stable, reproducible output.

#### Scenario: Same input produces same output
- **WHEN** the same prompt is sent twice with temperature 0
- **THEN** the responses SHALL be identical (within model constraints)
