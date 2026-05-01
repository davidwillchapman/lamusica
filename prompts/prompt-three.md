Treat any .gitignore paths and files as also being claude ignored.

Review the current codebase.

Create adjustment-plan-three.md and output a plan to implement the following feature.

Feature:

- Identify songs in music library that are AI generated.
- Generate report of AI Evaluation run.

Research:

- Consider what reference materials or online resources might exist for evaluation.

Details:

- Define an AI Identification Methodology for determining whether or not a song is AI generated, such that a confidence rating from 1-100 where 100 implies that the methodology has determined that the song is 100% guranteeed to not be AI generated.
- The methodology should have a scripted and an agent element to it.
- The scripted method should be used to identify anything that is easily excluded as an AI generated song candidate. This doesn't necessarily imply a 100% confidence rating, but instead just enough of a confidence rating to justify not having the AI Agent run on it.
- The agent method should allow an AI agent to evaluate any song and provide a determination.
- Design a process to gather any information required to apply the AI Identification Methodology.
- Define any DB Schema changes needed to track whether a song has been assessed both at the scripted and AI agent level, and what the resulting confidence ratings are.
- Design report such that it identifies number of songs in each quartile of confidence ratings (1-25, 26-50, 51-75, 76-100)
- Elaborate on two songs in each of the upper 3 quartiles, identifying why they were deemed to be fairly certain.
- Ensure report elaborates on all songs in the lowest confidence quartile and produces reasoning behind the determination.
- Do not assume that I know one way or the other, and thus any playlist or song inclusion that I have made should not be treated as a positive or negative signal on that alone.
