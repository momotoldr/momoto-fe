import type { PaymentQuote, Promos } from '@/types/promoType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

import type { CheckoutTarget } from './paymentsService'

const client = new AxiosClient()

/** The promos on offer, and — signed in — where this account stands with each. */
export async function getPromos(): Promise<Promos> {
  const { data } = await client.getData<Promos>(API_ROUTES.PROMOS)
  return data
}

/**
 * What a checkout of these items would cost with the promos applied. Priced by the same
 * server function the charge runs, so the cart never carries its own copy of the rules.
 */
export async function quoteOrder(target: CheckoutTarget): Promise<PaymentQuote> {
  const { data } = await client.postData<PaymentQuote>(API_ROUTES.PAYMENTS.QUOTE, target)
  return data
}
