# Assignment brief (source of truth)

> Careerflow.ai, Engineering Manager take-home, received 6 Oct 2026. Requirements below are copied from the brief (`docs/brief.pdf`). Do not edit them; add clarifications under "Notes". Product decisions that interpret the brief live in `docs/DECISIONS.md`.

## Background

Careerflow.ai is revolutionizing the job search process with AI-driven tools that include an AI resume builder, cover letter writer, and job application tracking board. One of our key features in the pipeline is the **AI Auto-apply** functionality, designed to help users seamlessly apply to jobs that align with their profile, preferences, and qualifications.

This assignment will focus on conceptualizing, planning, and prototyping this feature.

## Objective

Design a comprehensive strategy and prototype for the **AI Auto-apply** feature, demonstrating your ability to merge strategic vision with hands-on technical expertise.

## Deliverables

### 1. Technical Design Document

- **Feature Overview**: Provide a high-level description of the AI Auto-apply feature, including its purpose, target users, and expected outcomes.
- **System Architecture**: Outline the architecture for the feature, including all the different components.
- **AI Integration**: Detail how AI will be used to analyze user profiles, job descriptions, and application requirements to automate the application process effectively.
- **Scalability**: Include a plan for scaling the feature to handle millions of users.

### 2. Prototype Implementation

- Develop a lightweight prototype that demonstrates the ability to work across the stack for the AI Auto-apply feature.
- **Frontend Requirements:**
  - Use React and TypeScript to build a minimal user interface. Include a single button to trigger the auto-apply feature.
  - Display the application status (e.g., success, failure, pending) in real-time.
  - Hardcode preferences such as keywords, job filters, and application settings for simplicity.
- **Backend Requirements:**
  - Use Firebase as the database to store user preferences and application history.
  - Implement a lightweight backend service using a framework of your choice (e.g., Express.js, FastAPI) to simulate job scraping, processing, and actually applying.
  - Integrate a basic AI model or API (e.g., OpenAI, Claude) in this solution.
- Focus on showing how front-end and back-end systems interact seamlessly, rather than building a fully functional auto-apply system.

### 3. Implementation Roadmap and Project Plan

Provide a comprehensive roadmap and project plan for building and launching the AI Auto-apply feature. This should include:

- **Team Requirements**: Specify the roles and skills needed (e.g., front-end developer, back-end engineer, AI/ML specialist).
- **Timeline**: Break the project into phases with estimated timelines for each (e.g., research, design, implementation, testing, deployment), including key milestones.
- **Phases and Deliverables**: Clearly define deliverables for each phase, such as prototypes, code reviews, and testing reports.
- **Task Management**: Create a task board (e.g., Linear, Jira, Asana) or a Gantt chart to illustrate project flow and dependencies.
- **Resource Planning**: Include considerations for tools, APIs, and any other resources required.
- **Leadership and Execution**: Highlight how you would transition the project into execution mode, focusing on leadership, coordination, and adaptability.

### 4. Risk Assessment

Identify potential risks associated with the development and deployment of the AI Auto-apply feature. These might include:

- **Job Matching Errors**: Risks related to inaccurate matches between user profiles and job descriptions. Mitigation strategies could include implementing robust AI model testing, data validation, and user feedback loops.
- **API Limitations and Reliability**: Challenges with third-party API rate limits, downtimes, or data consistency issues. Propose strategies such as caching, retry mechanisms, and alternative data sources.
- **Data Security and Compliance**: Risks involving user data breaches or non-compliance with regulations like GDPR. Include mitigation strategies such as encryption, secure authentication methods, and periodic compliance audits.
- **Scalability Challenges**: Potential performance issues as user volume grows. Propose solutions such as horizontal scaling, database optimization, and performance monitoring tools.
- **User Experience Risks**: Issues that may arise from unclear workflows or UI design flaws. Mitigation could involve usability testing and iterative design improvements.

For each risk, outline the probability of occurrence, potential impact, and specific steps to reduce or manage the risk effectively.

## Final deliverables (what gets submitted)

- **Technical Design Document**: PDF detailing the architecture, AI approach, scalability plan, and compliance measures.
- **Prototype Code**: Upload to a private repository or send as a zip file.
- **Project Plan**: A comprehensive project plan, including timelines, team requirements, resource allocation, and task management tools (e.g., Linear, Jira, Gantt chart).
- **README File**: Include setup instructions, architecture explanation, and testing notes.
- **Video Walkthrough**: A 5-10 minute video explaining the assignment.
- **Responsible Use of AI Statement**: A short statement on how (if at all) AI tools were used (e.g., debugging, idea generation, code assistance). If AI was used to generate code, share full chat / prompt traces for transparency about how much code was written by the author vs an AI system. They look for people who leverage AI well while keeping expertise over the subject and knowing when to trust their own judgement over an AI assistant.

## Expectations (from the brief)

- Completing all parts is not mandatory, but candidates who complete all sections and deliverables with thoroughness and attention to detail are regarded highly.
- They look for strategic thinking, technical proficiency, and alignment with Careerflow.ai's mission: a structured, thoughtful approach that shows the ability to lead technical projects and solve real-world problems.
- The assignment shows the ability to translate business goals into technical strategy, design and implement AI-driven solutions, balance hands-on work with long-term vision, address scalability, compliance and security, and lead a team from planning to execution.

## Constraints

- Expected time: 24 hours from receipt (received the morning of 6 Oct 2026; submitting that night).
- AI-assisted development is allowed and must be disclosed with traces.

## Notes

- 2026-10-06: Product interpretation of the brief is recorded in `docs/DECISIONS.md`.
- 2026-10-06: The risk assessment (deliverable 4) is a section of the Technical Design Document, which the final-deliverables list ties to compliance.
- 2026-10-06: Task management is a Notion board (board + timeline views) linked from the project plan; the brief allows a board or a Gantt chart.
