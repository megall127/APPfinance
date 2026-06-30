/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'auth.register': {
    methods: ["POST"],
    pattern: '/api/v1/auth/register',
    tokens: [{"old":"/api/v1/auth/register","type":0,"val":"api","end":""},{"old":"/api/v1/auth/register","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/register","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['auth.register']['types'],
  },
  'auth.login': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.login']['types'],
  },
  'categories.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/categories',
    tokens: [{"old":"/api/v1/categories","type":0,"val":"api","end":""},{"old":"/api/v1/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['categories.index']['types'],
  },
  'categories.store': {
    methods: ["POST"],
    pattern: '/api/v1/categories',
    tokens: [{"old":"/api/v1/categories","type":0,"val":"api","end":""},{"old":"/api/v1/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['categories.store']['types'],
  },
  'categories.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/categories/:id',
    tokens: [{"old":"/api/v1/categories/:id","type":0,"val":"api","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"categories","end":""},{"old":"/api/v1/categories/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['categories.update']['types'],
  },
  'categories.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/categories/:id',
    tokens: [{"old":"/api/v1/categories/:id","type":0,"val":"api","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"categories","end":""},{"old":"/api/v1/categories/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['categories.destroy']['types'],
  },
  'items.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/items',
    tokens: [{"old":"/api/v1/items","type":0,"val":"api","end":""},{"old":"/api/v1/items","type":0,"val":"v1","end":""},{"old":"/api/v1/items","type":0,"val":"items","end":""}],
    types: placeholder as Registry['items.index']['types'],
  },
  'items.store': {
    methods: ["POST"],
    pattern: '/api/v1/items',
    tokens: [{"old":"/api/v1/items","type":0,"val":"api","end":""},{"old":"/api/v1/items","type":0,"val":"v1","end":""},{"old":"/api/v1/items","type":0,"val":"items","end":""}],
    types: placeholder as Registry['items.store']['types'],
  },
  'items.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/items/:id',
    tokens: [{"old":"/api/v1/items/:id","type":0,"val":"api","end":""},{"old":"/api/v1/items/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/items/:id","type":0,"val":"items","end":""},{"old":"/api/v1/items/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['items.update']['types'],
  },
  'items.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/items/:id',
    tokens: [{"old":"/api/v1/items/:id","type":0,"val":"api","end":""},{"old":"/api/v1/items/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/items/:id","type":0,"val":"items","end":""},{"old":"/api/v1/items/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['items.destroy']['types'],
  },
  'entries.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/entries',
    tokens: [{"old":"/api/v1/entries","type":0,"val":"api","end":""},{"old":"/api/v1/entries","type":0,"val":"v1","end":""},{"old":"/api/v1/entries","type":0,"val":"entries","end":""}],
    types: placeholder as Registry['entries.index']['types'],
  },
  'entries.upsert': {
    methods: ["POST"],
    pattern: '/api/v1/entries/upsert',
    tokens: [{"old":"/api/v1/entries/upsert","type":0,"val":"api","end":""},{"old":"/api/v1/entries/upsert","type":0,"val":"v1","end":""},{"old":"/api/v1/entries/upsert","type":0,"val":"entries","end":""},{"old":"/api/v1/entries/upsert","type":0,"val":"upsert","end":""}],
    types: placeholder as Registry['entries.upsert']['types'],
  },
  'entries.togglePaid': {
    methods: ["POST"],
    pattern: '/api/v1/entries/:id/toggle-paid',
    tokens: [{"old":"/api/v1/entries/:id/toggle-paid","type":0,"val":"api","end":""},{"old":"/api/v1/entries/:id/toggle-paid","type":0,"val":"v1","end":""},{"old":"/api/v1/entries/:id/toggle-paid","type":0,"val":"entries","end":""},{"old":"/api/v1/entries/:id/toggle-paid","type":1,"val":"id","end":""},{"old":"/api/v1/entries/:id/toggle-paid","type":0,"val":"toggle-paid","end":""}],
    types: placeholder as Registry['entries.togglePaid']['types'],
  },
  'entries.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/entries/:id',
    tokens: [{"old":"/api/v1/entries/:id","type":0,"val":"api","end":""},{"old":"/api/v1/entries/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/entries/:id","type":0,"val":"entries","end":""},{"old":"/api/v1/entries/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['entries.update']['types'],
  },
  'dashboard.yearly': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/dashboard/yearly',
    tokens: [{"old":"/api/v1/dashboard/yearly","type":0,"val":"api","end":""},{"old":"/api/v1/dashboard/yearly","type":0,"val":"v1","end":""},{"old":"/api/v1/dashboard/yearly","type":0,"val":"dashboard","end":""},{"old":"/api/v1/dashboard/yearly","type":0,"val":"yearly","end":""}],
    types: placeholder as Registry['dashboard.yearly']['types'],
  },
  'dashboard.monthSummary': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/dashboard',
    tokens: [{"old":"/api/v1/dashboard","type":0,"val":"api","end":""},{"old":"/api/v1/dashboard","type":0,"val":"v1","end":""},{"old":"/api/v1/dashboard","type":0,"val":"dashboard","end":""}],
    types: placeholder as Registry['dashboard.monthSummary']['types'],
  },
  'import.preview': {
    methods: ["POST"],
    pattern: '/api/v1/import/preview',
    tokens: [{"old":"/api/v1/import/preview","type":0,"val":"api","end":""},{"old":"/api/v1/import/preview","type":0,"val":"v1","end":""},{"old":"/api/v1/import/preview","type":0,"val":"import","end":""},{"old":"/api/v1/import/preview","type":0,"val":"preview","end":""}],
    types: placeholder as Registry['import.preview']['types'],
  },
  'import.commit': {
    methods: ["POST"],
    pattern: '/api/v1/import/commit',
    tokens: [{"old":"/api/v1/import/commit","type":0,"val":"api","end":""},{"old":"/api/v1/import/commit","type":0,"val":"v1","end":""},{"old":"/api/v1/import/commit","type":0,"val":"import","end":""},{"old":"/api/v1/import/commit","type":0,"val":"commit","end":""}],
    types: placeholder as Registry['import.commit']['types'],
  },
  'auth.me': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/auth/me',
    tokens: [{"old":"/api/v1/auth/me","type":0,"val":"api","end":""},{"old":"/api/v1/auth/me","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/me","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['auth.me']['types'],
  },
  'auth.logout': {
    methods: ["POST"],
    pattern: '/api/v1/auth/logout',
    tokens: [{"old":"/api/v1/auth/logout","type":0,"val":"api","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['auth.logout']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
