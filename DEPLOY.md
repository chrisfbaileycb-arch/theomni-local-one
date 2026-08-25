# Deploying OmniLocal #1

The app runs as a unified Node.js / Express service with Vite React frontend. It uses **Google Gemini** as the single source of truth for all AI execution, copilot tool calling, copywriting, video analysis, and decision-making.

## Environment Variables

### AI & Execution (Single Source of Truth)

| Var | What it does |
|---|---|
| `GEMINI_API_KEY` | **Google Gemini API Key** — The single source of truth for all AI intelligence: Sidebar Agent / Co-Captain, Content Director copywriting, Coach templates, Video critic, and Customer Maximizer decision making. |

### Architecture
- **AI Execution Engine**: `@google/genai` (Google Gemini 3.7 Flash)
- **Runtime**: Node.js / Express
- **Frontend**: React + Tailwind CSS
- **Persistence**: Self-contained state store
