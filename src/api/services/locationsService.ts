import type { LocationRegion, LocationsIndex } from '@/types/locationsType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const locationsClient = new AxiosClient()

/**
 * The lists only change with a deploy, so each is asked for once per session and shared
 * by every mount. A failed request is forgotten rather than cached, so "Try again" really
 * asks again.
 */
let indexPending: Promise<LocationsIndex> | null = null
const regionsPending = new Map<string, Promise<LocationRegion[]>>()

/** Provinces and country codes. */
export function fetchLocationsIndex(): Promise<LocationsIndex> {
  indexPending ??= locationsClient
    .getData<LocationsIndex>(API_ROUTES.LOCATIONS)
    .then(({ data }) => {
      if (!Array.isArray(data?.provinces) || !Array.isArray(data?.countries)) {
        throw new Error('locations returned an invalid body')
      }
      return data
    })
    .catch((error: unknown) => {
      indexPending = null
      throw error
    })
  return indexPending
}

/** One province's cities and regencies, in the order the select lists them. */
export function fetchProvinceRegions(provinceCode: string): Promise<LocationRegion[]> {
  let pending = regionsPending.get(provinceCode)
  if (!pending) {
    pending = locationsClient
      .getData<{ regions?: LocationRegion[] }>(API_ROUTES.LOCATION_REGIONS(provinceCode))
      .then(({ data }) => {
        if (!Array.isArray(data?.regions)) throw new Error('regions returned an invalid body')
        return data.regions
      })
      .catch((error: unknown) => {
        regionsPending.delete(provinceCode)
        throw error
      })
    regionsPending.set(provinceCode, pending)
  }
  return pending
}
