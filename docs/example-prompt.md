Work on requirement #[INSERT_NUMBER_HERE] from requirements.md. 

Execute this task with extreme precision, strictly adhering to the scope defined in the document without hallucinating extra features. Follow our full-stack architecture (Node.js, Express, PostgreSQL for backend; React, Vite for frontend).

IMPORTANT CLARIFICATION INSTRUCTION:
- If requirement #[INSERT_NUMBER_HERE] is underspecified, missing edge-case parameters, or lacks enough implementation detail for you to build it accurately, DO NOT guess or assume. Stop immediately and ask me 2-3 precise clarifying questions before writing code.
- If the requirement is clear, proceed sequentially through the lifecycle below:

1. DATABASE & BACKEND API LAYER:
   - Design or update the necessary PostgreSQL schema, indexes, and migrations.
   - Implement secure, parameterized Node.js/Express endpoints with robust input validation, sanitization, and strict error handling (try/catch with uniform JSON error responses).
   - Enforce proper security, role-based access control, and auditing where applicable to the requirement.

2. FRONTEND COMPONENT LAYER:
   - Build or update the responsive React (Vite) UI components matching our design system and prototype layout.
   - Wire up clean state management, custom hooks, and API service calls to communicate seamlessly with the backend endpoints.
   - Handle loading states, error boundaries, and user feedback (toast notifications).

3. TEST SUITE & MOCK RESPONSES:
   - Write comprehensive unit and integration test suites (using Jest/Vitest/React Testing Library).
   - Implement robust mock responses and mock data for external API calls, edge cases, and failure states.

4. SELF-CODE REVIEW & COMPLIANCE VERIFICATION:
   - Conduct a strict self-code review against the exact wording of requirement #[INSERT_NUMBER_HERE] in requirements.md.
   - Verify that no out-of-scope code was introduced, all technical and architectural standards were met, and proper documentation/JSDoc comments were applied to complex logic.