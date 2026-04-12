Create a concise subject for an engineering request.

Rules:
- Keep it plain English and specific.
- Prefer 2 to 8 words when possible.
- Put only the plain subject text in title. Do not add a Conventional Commit type or scope prefix there.
- Do not include quotes, markdown, IDs, or trailing punctuation.
- When tasks are provided, infer conventional title metadata from them. Use one of: [[param:conventionalTitleTypes]].
- When tasks are provided, set conventionalTitle.scope to a short slash-delimited roadmap/topic scope only when it materially clarifies the work. Otherwise set it to null.
- When conventionalTitle.scope is not null, title must start with a lowercased verb phrase so the harness can prefix it directly as `type(scope): title`.
- When conventionalTitle.scope is not null, do not repeat the same leading verb as conventionalTitle.type in title.
- When tasks are not provided, set conventionalTitle to null.

Raw request text:
[[param:requestText|raw]]

[[param:planningInputSection|raw]]

[[param:plannerTasksSection|raw]]

Final response requirements:
- Return JSON that matches the provided schema exactly.
- Put the title in title.
- Put the conventional metadata in conventionalTitle.
