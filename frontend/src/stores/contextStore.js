// Context store pour gérer le contexte utilisateur (solo ou team)

const CONTEXT_KEY = 'fleemy_context';

export const contextStore = {
  get() {
    try {
      const stored = localStorage.getItem(CONTEXT_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  set(context) {
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
    } catch (error) {
      console.error('Error saving context:', error);
    }
  },

  clear() {
    try {
      localStorage.removeItem(CONTEXT_KEY);
    } catch (error) {
      console.error('Error clearing context:', error);
    }
  },

  isSolo() {
    const context = this.get();
    return context?.type === 'solo';
  },

  isTeam() {
    const context = this.get();
    return context?.type === 'team';
  },

  getTeamId() {
    const context = this.get();
    return context?.type === 'team' ? context.teamId : null;
  },

  getTeamName() {
    const context = this.get();
    return context?.type === 'team' ? context.teamName : null;
  }
};
