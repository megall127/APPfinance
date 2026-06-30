/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  auth: {
    register: typeof routes['auth.register']
    login: typeof routes['auth.login']
    me: typeof routes['auth.me']
    logout: typeof routes['auth.logout']
  }
  categories: {
    index: typeof routes['categories.index']
    store: typeof routes['categories.store']
    update: typeof routes['categories.update']
    destroy: typeof routes['categories.destroy']
  }
  items: {
    index: typeof routes['items.index']
    store: typeof routes['items.store']
    update: typeof routes['items.update']
    destroy: typeof routes['items.destroy']
  }
  entries: {
    index: typeof routes['entries.index']
    upsert: typeof routes['entries.upsert']
    togglePaid: typeof routes['entries.togglePaid']
    update: typeof routes['entries.update']
  }
  dashboard: {
    yearly: typeof routes['dashboard.yearly']
    monthSummary: typeof routes['dashboard.monthSummary']
  }
  import: {
    preview: typeof routes['import.preview']
    commit: typeof routes['import.commit']
  }
}
