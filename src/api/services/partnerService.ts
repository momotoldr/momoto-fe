import type { MeResponse, PartnerInviteResponse, User } from '@/types/authType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const partnerClient = new AxiosClient()

/** Mint an invite code the user shares with their partner. */
export async function createInvite(): Promise<PartnerInviteResponse> {
  const { data } = await partnerClient.postData<PartnerInviteResponse>(API_ROUTES.PARTNER.INVITE)
  return data
}

/** Link the two accounts using a partner's invite code; returns the updated user. */
export async function acceptInvite(code: string): Promise<User> {
  const { data } = await partnerClient.postData<MeResponse>(API_ROUTES.PARTNER.ACCEPT, { code })
  return data.user
}

/** Unlink the current partner; returns the updated user. */
export async function unlinkPartner(): Promise<User> {
  const { data } = await partnerClient.deleteData<MeResponse>(API_ROUTES.PARTNER.ROOT)
  return data.user
}
