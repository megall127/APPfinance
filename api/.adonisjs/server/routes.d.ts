import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'auth.register': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'categories.index': { paramsTuple?: []; params?: {} }
    'categories.store': { paramsTuple?: []; params?: {} }
    'categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'items.index': { paramsTuple?: []; params?: {} }
    'items.store': { paramsTuple?: []; params?: {} }
    'items.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'items.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'entries.index': { paramsTuple?: []; params?: {} }
    'entries.upsert': { paramsTuple?: []; params?: {} }
    'entries.togglePaid': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'entries.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'dashboard.yearly': { paramsTuple?: []; params?: {} }
    'dashboard.monthSummary': { paramsTuple?: []; params?: {} }
    'import.preview': { paramsTuple?: []; params?: {} }
    'import.commit': { paramsTuple?: []; params?: {} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'categories.index': { paramsTuple?: []; params?: {} }
    'items.index': { paramsTuple?: []; params?: {} }
    'entries.index': { paramsTuple?: []; params?: {} }
    'dashboard.yearly': { paramsTuple?: []; params?: {} }
    'dashboard.monthSummary': { paramsTuple?: []; params?: {} }
    'auth.me': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'categories.index': { paramsTuple?: []; params?: {} }
    'items.index': { paramsTuple?: []; params?: {} }
    'entries.index': { paramsTuple?: []; params?: {} }
    'dashboard.yearly': { paramsTuple?: []; params?: {} }
    'dashboard.monthSummary': { paramsTuple?: []; params?: {} }
    'auth.me': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.register': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'categories.store': { paramsTuple?: []; params?: {} }
    'items.store': { paramsTuple?: []; params?: {} }
    'entries.upsert': { paramsTuple?: []; params?: {} }
    'entries.togglePaid': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'import.preview': { paramsTuple?: []; params?: {} }
    'import.commit': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'items.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'entries.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'items.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}