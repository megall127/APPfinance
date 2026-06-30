import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

/**
 * Allowed origins for cross-origin requests.
 *
 * Defaults to the Vite dev server (http://localhost:5173) plus the
 * production web app on Vercel. Extra origins can be added via the
 * CORS_ORIGIN env var (comma-separated) without changing this file.
 */
const defaultOrigins = ['http://localhost:5173', 'https://ap-pfinance.vercel.app']
const envOrigins = (env.get('CORS_ORIGIN', '') as string)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])]

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * Enable or disable CORS handling globally.
   */
  enabled: true,

  /**
   * Allowed origins for cross-origin requests.
   */
  origin: allowedOrigins,

  /**
   * HTTP methods accepted for cross-origin requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Reflect request headers by default. Use a string array to restrict
   * allowed headers.
   */
  headers: true,

  /**
   * Response headers exposed to the browser.
   */
  exposeHeaders: [],

  /**
   * Allow cookies/authorization headers on cross-origin requests.
   */
  credentials: true,

  /**
   * Cache CORS preflight response for N seconds.
   */
  maxAge: 90,
})

export default corsConfig
