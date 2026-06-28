import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import ImportService from '#modules/import/import_service'

@inject()
export default class ImportController {
  constructor(private importService: ImportService) {}

  /**
   * POST /api/v1/import/preview  (multipart `file`)
   * Parse the uploaded .xlsx and return a per-year summary. Writes nothing.
   */
  async preview({ request, workspace, response }: HttpContext) {
    const buffer = await this.#readUpload(request, response)
    if (!buffer) return

    const result = await this.importService.preview(Number(workspace.id), buffer)
    return response.ok(result)
  }

  /**
   * POST /api/v1/import/commit  (multipart `file`)
   * Parse + persist idempotently. Returns the written counts.
   */
  async commit({ request, workspace, response }: HttpContext) {
    const buffer = await this.#readUpload(request, response)
    if (!buffer) return

    const result = await this.importService.commit(Number(workspace.id), buffer)
    return response.ok(result)
  }

  /**
   * Validate + read the multipart `file` field into a Buffer.
   * Returns null (after writing a 422) when the upload is missing or invalid.
   */
  async #readUpload(
    request: HttpContext['request'],
    response: HttpContext['response']
  ): Promise<Buffer | null> {
    const file = request.file('file', { extnames: ['xlsx'], size: '10mb' })

    if (!file) {
      response.unprocessableEntity({ errors: [{ message: 'file is required' }] })
      return null
    }
    if (!file.isValid) {
      response.unprocessableEntity({ errors: file.errors })
      return null
    }
    if (!file.tmpPath) {
      response.unprocessableEntity({ errors: [{ message: 'uploaded file could not be read' }] })
      return null
    }

    return readFile(file.tmpPath)
  }
}
