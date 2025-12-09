import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface TerminalOutput {
  id: string;
  type: 'stdout' | 'stderr' | 'stdin' | 'system';
  content: string;
  timestamp: number;
}

export interface TerminalSession {
  id: string;
  name: string;
  cwd: string;
  createdAt: number;
  output: TerminalOutput[];
  isRunning: boolean;
  exitCode?: number;
  pid?: number;
}

export interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  maxOutputLines: number;
  // Actions
  createSession: (name?: string, cwd?: string) => string;
  closeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  addOutput: (sessionId: string, output: Omit<TerminalOutput, 'id' | 'timestamp'>) => void;
  clearOutput: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => void;
  setMaxOutputLines: (lines: number) => void;
}

export const useTerminalStore = create<TerminalState>()(
  immer((set) => ({
    sessions: [],
    activeSessionId: null,
    maxOutputLines: 1000,

    createSession: (name?: string, cwd?: string) => {
      const random = Math.random().toString(36);
      const id = `term_${String(Date.now())}_${random.slice(2, 11)}`;

      let sessionNumber = 1;
      set((state) => {
        sessionNumber = state.sessions.length + 1;
      });

      set((state) => {
        const processExists = typeof process !== 'undefined';
        const defaultCwd = processExists && typeof process.cwd === 'function' ? process.cwd() : '~';
        const newSession: TerminalSession = {
          id,
          name: name ?? `Terminal ${String(sessionNumber)}`,
          cwd: cwd ?? defaultCwd,
          createdAt: Date.now(),
          output: [],
          isRunning: false,
        };

        state.sessions.push(newSession);

        // Auto-select if it's the first session
        if (state.sessions.length === 1) {
          state.activeSessionId = id;
        }
      });

      return id;
    },

    closeSession: (id: string) =>
      { set((state) => {
        const sessionIndex = state.sessions.findIndex(s => s.id === id);
        if (sessionIndex === -1) return;

        state.sessions.splice(sessionIndex, 1);

        // Update active session if the closed one was active
        if (state.activeSessionId === id) {
          if (state.sessions.length > 0) {
            // Select the previous session, or the first one if we closed the first
            const newIndex = sessionIndex > 0 ? sessionIndex - 1 : 0;
            state.activeSessionId = state.sessions[newIndex]?.id ?? null;
          } else {
            state.activeSessionId = null;
          }
        }
      }); },

    setActiveSession: (id: string | null) =>
      { set((state) => {
        state.activeSessionId = id;
      }); },

    addOutput: (sessionId: string, output: Omit<TerminalOutput, 'id' | 'timestamp'>) =>
      { set((state) => {
        const session = state.sessions.find(s => s.id === sessionId);
        if (!session) return;

        const random = Math.random().toString(36);
        const newOutput: TerminalOutput = {
          ...output,
          id: `out_${String(Date.now())}_${random.slice(2, 11)}`,
          timestamp: Date.now(),
        };

        session.output.push(newOutput);

        // Trim output if it exceeds maxOutputLines
        if (session.output.length > state.maxOutputLines) {
          const excess = session.output.length - state.maxOutputLines;
          session.output.splice(0, excess);
        }
      }); },

    clearOutput: (sessionId: string) =>
      { set((state) => {
        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
          session.output = [];
        }
      }); },

    updateSession: (sessionId: string, updates: Partial<TerminalSession>) =>
      { set((state) => {
        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
          Object.assign(session, updates);
        }
      }); },

    setMaxOutputLines: (lines: number) =>
      { set((state) => {
        state.maxOutputLines = Math.max(100, lines); // Minimum 100 lines

        // Trim all sessions to the new limit
        state.sessions.forEach(session => {
          if (session.output.length > lines) {
            const excess = session.output.length - lines;
            session.output.splice(0, excess);
          }
        });
      }); },
  }))
);
