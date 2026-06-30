/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'auth.register': {
    methods: ["POST"]
    pattern: '/api/v1/auth/register'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/auth/auth_validators').registerValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/auth/auth_validators').registerValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['register']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['register']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.login': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/auth/auth_validators').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/auth/auth_validators').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['login']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['login']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['index']>>>
    }
  }
  'categories.store': {
    methods: ["POST"]
    pattern: '/api/v1/categories'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/categories/category_validator').createCategoryValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/categories/category_validator').createCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/categories/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/categories/category_validator').updateCategoryValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#modules/categories/category_validator').updateCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/categories/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/categories/categories_controller').default['destroy']>>>
    }
  }
  'items.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/items'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#modules/items/item_validator').listItemsQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'items.store': {
    methods: ["POST"]
    pattern: '/api/v1/items'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/items/item_validator').createItemValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/items/item_validator').createItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'items.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/items/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/items/item_validator').updateItemValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#modules/items/item_validator').updateItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'items.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/items/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/items/items_controller').default['destroy']>>>
    }
  }
  'entries.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/entries'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#modules/entries/entry_validator').monthViewQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'entries.upsert': {
    methods: ["POST"]
    pattern: '/api/v1/entries/upsert'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/entries/entry_validator').upsertEntryValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/entries/entry_validator').upsertEntryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['upsert']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['upsert']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'entries.togglePaid': {
    methods: ["POST"]
    pattern: '/api/v1/entries/:id/toggle-paid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['togglePaid']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['togglePaid']>>>
    }
  }
  'entries.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/entries/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/entries/entry_validator').updateEntryValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#modules/entries/entry_validator').updateEntryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/entries/entries_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'dashboard.yearly': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/dashboard/yearly'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#modules/dashboard/dashboard_validator').yearlyQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/dashboard/dashboard_controller').default['yearly']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/dashboard/dashboard_controller').default['yearly']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'dashboard.monthSummary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/dashboard'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#modules/dashboard/dashboard_validator').monthSummaryQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/dashboard/dashboard_controller').default['monthSummary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/dashboard/dashboard_controller').default['monthSummary']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'import.preview': {
    methods: ["POST"]
    pattern: '/api/v1/import/preview'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/import/import_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/import/import_controller').default['preview']>>>
    }
  }
  'import.commit': {
    methods: ["POST"]
    pattern: '/api/v1/import/commit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/import/import_controller').default['commit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/import/import_controller').default['commit']>>>
    }
  }
  'auth.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/auth/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['me']>>>
    }
  }
  'auth.logout': {
    methods: ["POST"]
    pattern: '/api/v1/auth/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['logout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/auth_controller').default['logout']>>>
    }
  }
}
