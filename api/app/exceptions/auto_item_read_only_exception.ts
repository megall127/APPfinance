import { Exception } from '@adonisjs/core/exceptions'

/**
 * 422 para toda tentativa de escrever no item — ou no lancamento — gerado
 * automaticamente por uma feature (hoje so a aba Gastos).
 *
 * Mora na API, e nao so na UI, de proposito: o cadeado da tela e consequencia
 * desta excecao, nao a defesa. Sem ela, um PATCH direto dessincronizaria o total
 * do mes em relacao aos gastos que o originaram.
 */
export default class AutoItemReadOnlyException extends Exception {
  static status = 422
  static code = 'E_AUTO_ITEM_READONLY'
}
