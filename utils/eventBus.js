/** 全局事件名（统一走 app.eventBus，避免多套总线） */
export const AppEvents = {
  POINTS_CHANGED: 'points-changed',
  FLOAT_BUTTON_CHANGE: 'float-button-change',
};

export default function createBus() {
  return {
    events: {},
    on(event, callback) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(callback);
    },
    off(event, callback) {
      if (!this.events[event]) return;
      if (!callback) this.events[event] = [];
      else {
        const index = this.events[event].indexOf(callback);
        if (index !== -1) this.events[event].splice(index, 1);
      }
    },
    emit(event, ...args) {
      if (this.events[event]) this.events[event].forEach((callback) => callback(...args));
    },
  };
}
