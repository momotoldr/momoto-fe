import type { MeResponse, PartnerInviteResponse, User } from '@/types/authType'
import type { PartnerLinkPromo } from '@/types/promoType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const partnerClient = new AxiosClient()

/** Mint an invite code the user shares with their partner. */
export async function createInvite(): Promise<PartnerInviteResponse> {
  const { data } = await partnerClient.postData<PartnerInviteResponse>(API_ROUTES.PARTNER.INVITE)
  return data
}

/**
 * Link the two accounts using a partner's invite code. Returns the updated user, and
 * whether the link earned this account the partner promo (docs/PLAN-promos.md §1b).
 */
export async function acceptInvite(
  code: string
): Promise<{ user: User; promo: PartnerLinkPromo | null }> {
  const { data } = await partnerClient.postData<MeResponse & { promo?: PartnerLinkPromo }>(
    API_ROUTES.PARTNER.ACCEPT,
    { code }
  )
  return { user: data.user, promo: data.promo ?? null }
}

/** Unlink the current partner; returns the updated user. */
export async function unlinkPartner(): Promise<User> {
  const { data } = await partnerClient.deleteData<MeResponse>(API_ROUTES.PARTNER.ROOT)
  return data.user
}
