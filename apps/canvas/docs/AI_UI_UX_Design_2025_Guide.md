# Comprehensive AI for UI/UX Design Guide (2025)

A deep dive into how Claude, ChatGPT, Gemini, and other AI tools are revolutionizing UI/UX design, including prompts, agents, sub-agents, skills, and best practices.

---

## Table of Contents

1. [The Three Eras of AI Interaction](#the-three-eras-of-ai-interaction)
2. [Claude AI for UI/UX Design](#claude-ai-for-uiux-design)
3. [ChatGPT & OpenAI AgentKit](#chatgpt--openai-agentkit)
4. [Google Gemini & Generative UI](#google-gemini--generative-ui)
5. [Multi-Agent Architecture Patterns](#multi-agent-architecture-patterns)
6. [Specialized Sub-Agents](#specialized-sub-agents)
7. [AI Design Tools Ecosystem](#ai-design-tools-ecosystem)
8. [Prompt Engineering for Design](#prompt-engineering-for-design)
9. [Figma + MCP Integration](#figma--mcp-integration)
10. [Accessibility & Design Tokens](#accessibility--design-tokens)
11. [Motion Design & Micro-interactions](#motion-design--micro-interactions)
12. [Best Practices & Patterns](#best-practices--patterns)

---

## The Three Eras of AI Interaction

The field has evolved through three distinct phases:

| Era                     | Focus             | Description                                          |
| ----------------------- | ----------------- | ---------------------------------------------------- |
| **Prompt Engineering**  | Single queries    | Crafting effective one-shot prompts                  |
| **Context Engineering** | Session context   | Managing conversation history and context windows    |
| **Agent Engineering**   | Autonomous agents | Designing specialized, reusable, efficient AI agents |

> Source: [ClaudeLog - Agent Engineering](https://claudelog.com/mechanics/agent-engineering/)

---

## Claude AI for UI/UX Design

### Key Strengths

- Excellent at contextual understanding, UX writing, and accessibility-focused content
- Massive context window allows feeding examples of websites you like
- Can maintain a "vibe" across an entire design session

### Claude Code UI Agents Repository

A curated collection of specialized prompts organized into categories:

| Category                | Purpose                           |
| ----------------------- | --------------------------------- |
| UI Design               | Interface creation, visual design |
| Web Development         | HTML/CSS/JS implementation        |
| Component Development   | Reusable component patterns       |
| UX Research & Usability | User research, testing            |
| Animation               | Motion design, transitions        |
| Responsive Design       | Mobile-first, adaptive layouts    |
| Accessibility           | WCAG compliance, a11y patterns    |

> Source: [GitHub - claude-code-ui-agents](https://github.com/mustafakendiguzel/claude-code-ui-agents)

### CLAUDE.md System Prompts

Claude Code uses 40+ different system prompt strings that are conditionally loaded based on environment and configuration:

- **Builtin Tools**: Write, Bash, TodoWrite, etc.
- **Builtin Agents**: Plan, Explore, Task
- **Utility Prompts**: CLAUDE.md generation, session titles, compaction
- **Security Review**: Automated security analysis

> Source: [Piebald-AI System Prompts Repository](https://github.com/Piebald-AI/claude-code-system-prompts)

### Skills for Frontend Design

Claude has strong design understanding, but "distributional convergence" obscures it without guidance. Skills unlock this:

```
Skills are highly customizable – you can create your own tailored to:
- Your company's design system
- Specific component patterns
- Industry-specific UI conventions
```

> Source: [Claude Blog - Improving Frontend Design Through Skills](https://claude.com/blog/improving-frontend-design-through-skills)

---

## ChatGPT & OpenAI AgentKit

### AgentKit (October 2025)

OpenAI launched AgentKit with tools to build, deploy, and optimize agents:

| Component              | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| **Agent Builder**      | Visual canvas for creating and versioning multi-agent workflows    |
| **Connector Registry** | Pre-built API integrations                                         |
| **ChatKit**            | Embed agentic UIs with streaming responses and thinking indicators |

> Source: [OpenAI - Introducing AgentKit](https://openai.com/index/introducing-agentkit/)

### ChatGPT Agent for Designers

Key differentiator: **Contextual tool selection** - Agent automatically chooses between:

- Visual browsing
- Text-based browsing
- Terminal access
- API calls

The iterative collaboration model allows interrupting Agent mid-task to course-correct.

> Source: [Medium - ChatGPT Agent: A Product Designer's Guide](https://medium.com/@brettcooper122/chatgpt-agent-a-product-designers-guide-to-ai-augmented-workflows-a70ec3ef5ae2)

### Apps SDK UI Components

Build custom UI components for ChatGPT apps:

- Components run inside an iframe
- Talk to host via `window.openai` API
- Use Tailwind + CSS variable design tokens
- Pre-built accessible component library

> Source: [OpenAI Developers - Build Your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui/)

---

## Google Gemini & Generative UI

### Gemini 3 Features (2025)

A radical shift toward an agentic-first experience:

| Feature              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| **Gemini Canvas**    | Go from prompt to prototype in minutes                   |
| **Dynamic View**     | Designs and codes fully customized interactive responses |
| **Visual Layout**    | AI-generated visual layouts for any prompt               |
| **1M Token Context** | For Google AI Pro/Ultra subscribers                      |

> Source: [UX Planet - Gemini 3 for UI Design](https://uxplanet.org/gemini-3-for-ui-design-f3fb44a295a6)

### Google Stitch

Unveiled at I/O 2025, Stitch turns "ideas into UI designs and front-end code in minutes."

> Source: [DesignerUp - Google Stitch First Look](https://designerup.co/blog/google-stitch-first-look/)

### Generative UI Capabilities

Rolling out in Gemini app and Google Search (AI Mode):

- Creates immersive experiences
- Interactive tools and simulations
- Generated completely on the fly for any prompt

> Source: [Google Research Blog - Generative UI](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)

---

## Multi-Agent Architecture Patterns

### Role-Based Agent Systems

**MetaGPT Pattern**: Operates like a virtual software company with specialized roles:

| Agent Role         | Responsibility               |
| ------------------ | ---------------------------- |
| Product Manager    | Defines vision, user stories |
| Architect          | Sets up structure, API specs |
| Frontend Developer | Builds UI components         |
| Backend Developer  | API logic, data layer        |
| QA Engineer        | Testing, validation          |
| Tech Writer        | Documentation                |

From a single-line prompt, MetaGPT generates user stories, system designs, API specifications, and entire codebases.

> Source: [Medium - Best 3 AI Agent Builders for Full-Stack Apps](https://medium.com/@billxu_atoms/best-3-ai-agent-builders-for-full-stack-apps-2025-generate-frontend-backend-and-deploy-in-12cb29758ab4)

### Key Frameworks

| Framework           | Best For                                |
| ------------------- | --------------------------------------- |
| **LangGraph**       | Graph-based conditional logic workflows |
| **AutoGen**         | Collaborative multi-agent systems       |
| **Semantic Kernel** | Enterprise AI integration               |
| **CrewAI**          | Role-based task delegation              |
| **AG-UI**           | Frontend/runtime layer for agents       |

> Source: [Collabnix - Multi-Agent Multi-LLM Systems Guide 2025](https://collabnix.com/multi-agent-multi-llm-systems-the-future-of-ai-architecture-complete-guide-2025/)

### Context Engineering

Production-grade agents require treating context as a first-class system with its own:

- Architecture
- Lifecycle
- Constraints

> Source: [Google Developers Blog - Architecting Multi-Agent Framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)

---

## Specialized Sub-Agents

### Available Frontend Agents

| Agent                 | Specialty                                               |
| --------------------- | ------------------------------------------------------- |
| `frontend-developer`  | React components, responsive layouts, client-side state |
| `ui-designer`         | Creative UI design, user-friendly interfaces            |
| `ux-designer`         | User experience, interaction optimization               |
| `react-pro`           | Expert React with hooks, performance                    |
| `nextjs-pro`          | SSR, SSG, full-stack React                              |
| `accessibility-agent` | WCAG compliance, a11y patterns                          |
| `animation-agent`     | Motion design, micro-interactions                       |

> Source: [Claude Code Sub Agents - UI Designer](https://subagents.app/agents/ui-designer)

### Sub-Agent Advantages

Each subagent runs in its own context window:

- Frontend specialist handles React state management
- Backend expert focuses on API design
- No confusion between component props and database schemas

> Source: [Mobalab - Claude Code Subagents Developer Guide](https://engineering.mobalab.net/2025/08/28/claude-code-subagents-a-developers-guide-to-specialized-ai-assistants/)

### Custom Command Structure

Create commands in `.claude/commands/` folder:

```markdown
<!-- .claude/commands/design-review.md -->

Review the UI component at $ARGUMENTS for:

1. Visual hierarchy and spacing
2. Accessibility (WCAG 2.1 AA)
3. Responsive breakpoints
4. Component reusability
5. Design system alignment
```

> Source: [Builder.io - How I Use Claude Code](https://www.builder.io/blog/claude-code)

---

## AI Design Tools Ecosystem

### Prompt-to-UI Tools

| Tool                 | Features                                                 |
| -------------------- | -------------------------------------------------------- |
| **v0 by Vercel**     | React + Tailwind + shadcn/ui, production-ready code      |
| **Figma Make**       | Words to functional prototypes, design system connection |
| **Uizard**           | Multi-screen prototypes, hand-drawn sketch conversion    |
| **Visily**           | Text/Screenshot/Sketch to design, auto-prototyping       |
| **Miro Prototyping** | Sticky notes to interactive prototypes                   |
| **Bolt.new**         | Full-stack AI web development agent                      |

### v0 by Vercel Best Practices

Best prompts include three core inputs:

1. **Product surface**: components, data, actions
2. **User context**: role, technical comfort, environment
3. **Constraints**: what not to invent

```
Use prompts for logic and structure. Use Design Mode for visual tweaks.
```

> Source: [Vercel - How to Prompt v0](https://vercel.com/blog/how-to-prompt-v0)

### AI Code Editors

| Editor       | Approach                          | Best For                               |
| ------------ | --------------------------------- | -------------------------------------- |
| **Cursor**   | VS Code-based, developer-first AI | Experienced developers wanting control |
| **Windsurf** | Agentic IDE with "Cascade" AI     | Beginners, guided pair-programming     |

> Source: [Builder.io - Windsurf vs Cursor](https://www.builder.io/blog/windsurf-vs-cursor)

---

## Prompt Engineering for Design

### Prompt Structure Formula

```
[ROLE] + [CONTEXT] + [TASK] + [CONSTRAINTS] + [FORMAT]
```

### UI Design Prompt Examples

#### Component Generation

```
Create a responsive dashboard card component with:
- Header with icon and title
- Trend indicator (up/down arrow with percentage)
- Main metric display (large number)
- Sparkline chart footer
- Hover state with subtle shadow
Use React + TypeScript + Tailwind CSS v4. Mobile-first.
```

#### Design System Alignment

```
Generate a Button component that follows this design system:
- Primary: bg-blue-600, hover:bg-blue-700
- Secondary: bg-gray-100, hover:bg-gray-200
- Sizes: sm (h-8), md (h-10), lg (h-12)
- Include loading state with spinner
- Ensure 4.5:1 contrast ratio for text
```

#### Accessibility-First

```
Create an accessible modal dialog with:
- Focus trap (keyboard navigation stays inside)
- ESC to close
- Click outside to close
- aria-labelledby pointing to title
- aria-describedby for description
- Proper focus restoration on close
```

### UX Research Prompts

#### Persona Generation

```
Generate a UX persona for a 28-year-old mobile-first user of our
SaaS platform who frequently uses analytics dashboards and
struggles with onboarding. Include:
- Demographics and background
- Goals and motivations
- Pain points and frustrations
- Technology comfort level
- A day-in-the-life scenario
```

> Source: [Parallel HQ - Using AI for User Persona Generation](https://www.parallelhq.com/blog/using-ai-user-persona-generation)

#### User Journey Mapping

```
Create a user journey map for [persona] signing up for [product].
For each stage, include:
- User actions
- Touchpoints
- Emotional state (frustration to delight scale)
- Pain points
- Opportunities for improvement
```

> Source: [UX Collective - Using AI to Streamline Persona and Journey Map Creation](https://uxdesign.cc/using-ai-to-streamline-persona-and-journey-map-creation-37fa859dafb0)

---

## Figma + MCP Integration

### MCP Server Benefits

Design systems become a productivity coefficient for AI-powered workflows:

| Feature              | Benefit                       |
| -------------------- | ----------------------------- |
| Style/Variable Usage | AI understands your tokens    |
| Variable Code Syntax | Proper implementation in code |
| Code Connect         | Maps Figma components to code |

> Source: [Figma Blog - Design Systems And AI: Why MCP Servers Are The Unlock](https://www.figma.com/blog/design-systems-ai-mcp/)

### Figma Make Integration

1. Connect Make to your design system library files
2. Add styling context from your Figma library
3. Stay visually consistent with design system
4. Generate production-ready code

### Code Connect UI

- Connect Figma directly to GitHub repositories
- AI suggestions to find the right code file
- Map Figma components to code—no coding necessary

> Source: [Figma Blog - Schema 2025: Design Systems For A New Era](https://www.figma.com/blog/schema-2025-design-systems-recap/)

### 2025 Stats

- Twice as many Figma users are building agentic products compared to last year
- Figma MCP server now generally available
- Works with VS Code, Cursor, Windsurf, Claude Code

> Source: [Figma 2025 AI Report](https://www.figma.com/reports/ai-2025/)

---

## Accessibility & Design Tokens

### AI-Readable Token Structure

```json
{
  "color": {
    "primary": {
      "value": "#2563eb",
      "a11y": {
        "contrastOnWhite": "4.52:1",
        "wcagLevel": "AA",
        "notes": "Do not use as text on dark backgrounds"
      },
      "usage": "Primary actions, links, focus states",
      "pairedWith": ["color.primary.foreground"],
      "components": ["Button", "Link", "Badge"]
    }
  }
}
```

> Source: [The Design System Guide - Design Tokens That AI Can Actually Read](https://learn.thedesignsystem.guide/p/design-tokens-that-ai-can-actually)

### WCAG 2025 Requirements

| Compliance     | Normal Text | Large Text |
| -------------- | ----------- | ---------- |
| AA (minimum)   | 4.5:1       | 3:1        |
| AAA (enhanced) | 7:1         | 4.5:1      |

**Legal context**: 4,605 ADA lawsuits filed in 2024, European Accessibility Act in force since June 28, 2025.

> Source: [AllAccessible - Color Contrast Accessibility WCAG 2025 Guide](https://www.allaccessible.org/blog/color-contrast-accessibility-wcag-guide-2025)

### Accessibility Prompt

```
Act like an expert in inclusive design and accessibility.
I will provide foreground and background color pairs.
For each pair:
1. Calculate the contrast ratio
2. Check if it meets WCAG 2.2 SC 1.4.3 (4.5:1 normal, 3:1 large)
3. If it fails, suggest alternative hex codes that meet WCAG
```

> Source: [A11Y.ng - Top 7 AI Prompts for Web Accessibility](https://a11y.ng/top-7-ai-prompts-as-suggested-forbes-web-accessibility/)

### Tools

- **InclusiveColors**: Build WCAG-compliant palettes, export to Tailwind/CSS/Figma
- **Tokens Studio + Figma**: Visual mapping and token management
- **Style Dictionary**: Multi-mode token exports (light, dark, high contrast)

> Source: [InclusiveColors](https://www.inclusivecolors.com/)

---

## Motion Design & Micro-interactions

### AI Animation Tools

| Tool                 | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| **Magician (Figma)** | AI suggests motion prompts, interaction patterns        |
| **Genius (Figma)**   | Intelligent transition and layout animation suggestions |
| **Runway**           | Background removal, motion tracking, generative video   |
| **Hera**             | Text-to-motion graphics                                 |
| **Motionvid**        | Plain English to polished motion graphics               |

> Source: [Illustration.app - Best AI Animation Tools for UI/UX Designers 2025](https://www.illustration.app/blog/best-ai-animation-tools-for-uiux-designers-in-2025)

### 2025 Trends

1. **Skeleton loaders and shimmer effects** for smoother loading states
2. **Animated button responses** for success/error states
3. **Live validation** in form fields
4. **AI-personalized interactions** that respond to user behavior in real time

> Source: [Bricx Labs - 12 Micro Animation Examples 2025](https://bricxlabs.com/blogs/micro-interactions-2025-examples)

### Best Practices

- Animations should run between **200-500 milliseconds**
- Match user motion settings (respect `prefers-reduced-motion`)
- Use hardware-accelerated properties (`transform`, `opacity`)

> Source: [Web Peak - CSS/JS Animation Trends 2025](https://webpeak.org/blog/css-js-animation-trends/)

---

## Best Practices & Patterns

### UI Design Patterns for AI Interfaces

Moving beyond chat-only UIs:

| Pattern                 | Description                                   |
| ----------------------- | --------------------------------------------- |
| **Task-oriented UIs**   | Temperature controls, knobs, sliders, buttons |
| **Presets & Templates** | AI provides predefined options                |
| **Refinement Controls** | Highlight specific parts to change            |
| **Contextual Prompts**  | Act on highlighted parts, not global prompts  |

> Source: [Smashing Magazine - Design Patterns For AI Interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/)

### Component Library Standards

- Use naming conventions: `PrimaryButton`, `DangerAlert`, `InputField_Large`
- Keep behaviors predictable, styling on-brand
- Design once, use everywhere

> Source: [Webstacks - UI Design Best Practices 2025](https://www.webstacks.com/blog/ui-design-best-practices)

### 11 Prompting Tips for Better UIs

1. Be specific about components and elements
2. List actual data, not vague descriptions
3. Include responsive/mobile-first requirements
4. Specify hover, focus, and interaction states
5. Define constraints (what NOT to do)
6. Reference design system tokens
7. Include accessibility requirements
8. Specify loading and error states
9. Define edge cases (empty states, long text)
10. Use iterative refinement
11. Start with structure, add polish later

> Source: [Builder.io - 11 Prompting Tips for Building UIs](https://www.builder.io/blog/prompting-tips)

### Code Review Integration

- 81% of those who use AI for code review saw quality improvements
- 8% of suggestions focus on aligning with company best practices
- Soft limit of 200-400 lines per PR recommended

> Source: [Qodo - State of AI Code Quality 2025](https://www.qodo.ai/reports/state-of-ai-code-quality/)

---

## Example Agent Configurations

### UX Designer Agent

```markdown
# UX Designer Agent

## Role

You are a UX specialist focused on user experience analysis.

## When Invoked

- Analyze user interface elements and workflows
- Identify usability issues and improvement opportunities
- Provide actionable UX recommendations
- Consider accessibility and user journey optimization

## Capabilities

- Heuristic evaluation
- Cognitive walkthrough simulation
- Accessibility audit (WCAG 2.1)
- Information architecture review
- Interaction design patterns

## Output Format

1. Summary of findings
2. Severity-ranked issues
3. Specific recommendations with examples
4. Implementation priority
```

### Design System Agent

```markdown
# Design System Agent

## Role

Ensure all generated UI aligns with the established design system.

## Context

- Tokens: [link to tokens.json]
- Components: [link to component library]
- Guidelines: [link to design guidelines]

## Behavior

1. Check all colors against token values
2. Verify spacing uses 4px/8px grid
3. Ensure typography matches type scale
4. Validate component usage patterns
5. Flag any deviations with alternatives
```

### Accessibility Agent

```markdown
# Accessibility Agent

## Role

WCAG 2.1 AA compliance specialist.

## Checks

- Color contrast (4.5:1 text, 3:1 graphics)
- Keyboard navigation
- Screen reader compatibility
- Focus management
- Alternative text
- Form labeling
- Error identification

## Output

- Pass/Fail for each criterion
- Specific WCAG reference (e.g., 1.4.3)
- Remediation steps with code examples
```

---

## Quick Reference

### Top AI Tools by Use Case

| Use Case             | Best Tools                         |
| -------------------- | ---------------------------------- |
| Component Generation | v0, Claude Code, Cursor            |
| Wireframe to Code    | Figma Make, Uizard, Visily         |
| Design System        | Figma MCP, Tokens Studio           |
| Accessibility        | InclusiveColors, axe DevTools + AI |
| Animation            | Magician, Runway, Hera             |
| UX Research          | ChatGPT, Claude, Gemini            |
| Code Review          | Qodo, GitHub Copilot               |
| Full-Stack Apps      | Bolt.new, Replit Agent, MetaGPT    |

### Prompt Template

```
## Context
[Your design system, tech stack, brand guidelines]

## Task
[Specific component or feature to create]

## Requirements
- [ ] Responsive (mobile-first)
- [ ] Accessible (WCAG 2.1 AA)
- [ ] Uses design tokens
- [ ] Includes hover/focus states
- [ ] Handles edge cases

## Constraints
- No external dependencies beyond [allowed libraries]
- Match existing patterns in [reference file]
- Performance budget: [metrics]

## Output Format
[React/Vue/HTML] with [Tailwind/CSS] and TypeScript types
```

---

## Sources

### Claude & Anthropic

- [Claude Blog - Improving Frontend Design Through Skills](https://claude.com/blog/improving-frontend-design-through-skills)
- [Anthropic - Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [GitHub - claude-code-ui-agents](https://github.com/mustafakendiguzel/claude-code-ui-agents)
- [GitHub - Piebald-AI System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
- [Medium - Complete Collection of Claude Code Prompts](https://medium.com/@henriallevi/complete-collection-of-claude-code-prompts-to-avoid-generic-ux-ui-design-4565496cd894)

### OpenAI & ChatGPT

- [OpenAI - Introducing AgentKit](https://openai.com/index/introducing-agentkit/)
- [OpenAI Developers - Build Your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui/)
- [Engage Coders - AI-Driven ChatGPT Prompts for UX Design 2025](https://www.engagecoders.com/8-chatgpt-prompts-for-ux-design-to-try-in-2025/)

### Google & Gemini

- [Google Research Blog - Generative UI](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)
- [UX Planet - Gemini 3 for UI Design](https://uxplanet.org/gemini-3-for-ui-design-f3fb44a295a6)
- [Gemini Canvas](https://gemini.google/overview/canvas/)

### Figma

- [Figma Blog - Design Systems And AI: MCP Servers](https://www.figma.com/blog/design-systems-ai-mcp/)
- [Figma 2025 AI Report](https://www.figma.com/reports/ai-2025/)
- [Figma AI Wireframe Generator](https://www.figma.com/solutions/ai-wireframe-generator/)

### Tools & Platforms

- [Vercel - How to Prompt v0](https://vercel.com/blog/how-to-prompt-v0)
- [Builder.io - Windsurf vs Cursor](https://www.builder.io/blog/windsurf-vs-cursor)
- [Uizard](https://uizard.io/)
- [Visily](https://www.visily.ai/)

### Best Practices & Patterns

- [Smashing Magazine - Design Patterns For AI Interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/)
- [Builder.io - 11 Prompting Tips for Building UIs](https://www.builder.io/blog/prompting-tips)
- [Qodo - State of AI Code Quality 2025](https://www.qodo.ai/reports/state-of-ai-code-quality/)

### Accessibility

- [AllAccessible - WCAG 2025 Guide](https://www.allaccessible.org/blog/color-contrast-accessibility-wcag-guide-2025)
- [The Design System Guide - Design Tokens AI Can Read](https://learn.thedesignsystem.guide/p/design-tokens-that-ai-can-actually)
- [InclusiveColors](https://www.inclusivecolors.com/)

### Multi-Agent Architecture

- [Collabnix - Multi-Agent Multi-LLM Systems Guide 2025](https://collabnix.com/multi-agent-multi-llm-systems-the-future-of-ai-architecture-complete-guide-2025/)
- [Google Developers Blog - Multi-Agent Framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)

---

_Last Updated: December 2025_
