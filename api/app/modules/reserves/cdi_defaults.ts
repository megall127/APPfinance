/**
 * CDI ANUAL de fallback, em PERCENTUAL (§3.4): `14.9` = 14,90% ao ano.
 *
 * A tabela `cdi_rates` é ESPARSA e escopada por workspace — o usuário digita um número
 * por vigência ("o CDI está em 14,90% a.a.") e ele vale por carry-forward até aparecer
 * uma linha mais nova. Não existe seeder: um workspace recém-criado não tem nenhuma
 * linha de CDI, e uma conta em `% do CDI` cadastrada no primeiro dia precisaria falhar
 * com `cdi_missing` para sempre.
 *
 * Esta constante é a saída desse impasse: quando o workspace não tem NENHUMA vigência
 * de CDI aplicável, `RateService.resolveCdiAnnual` devolve este valor com
 * `source: 'default'` — e a UI marca o resultado com o badge "CDI estimado", para que
 * o número exibido nunca se passe por dado cadastrado pela família.
 *
 * PERCENTUAL, nunca fração: quem consome converte (`14.9 / 100`) dentro de
 * `effectiveMonthlyRate` (§5.0).
 */
export const DEFAULT_CDI_ANNUAL = 14.9
