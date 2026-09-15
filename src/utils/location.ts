import type { LocationInput, UserLocation } from '@/types/authType'
import type { LocationValues } from '@/validations'

/** The empty location — also what "Clear" resets to. */
export const NO_LOCATION: LocationValues = {
  kind: 'none',
  provinceCode: '',
  regionCode: '',
  countryCode: '',
  cityName: '',
}

/** A saved location → the profile form's flat value. */
export function toLocationValues(location: UserLocation | null): LocationValues {
  if (!location) return NO_LOCATION
  if (location.regionCode) {
    return {
      ...NO_LOCATION,
      kind: 'region',
      // A region code starts with its province's ("32.73" → "32").
      provinceCode: location.provinceCode ?? location.regionCode.split('.')[0] ?? '',
      regionCode: location.regionCode,
    }
  }
  return {
    ...NO_LOCATION,
    kind: 'abroad',
    countryCode: location.countryCode,
    cityName: location.cityName ?? '',
  }
}

/** The profile form's value → what `PATCH /auth/me` accepts (`null` clears it). */
export function toLocationInput(value: LocationValues): LocationInput | null {
  if (value.kind === 'region' && value.regionCode) return { regionCode: value.regionCode }
  if (value.kind === 'abroad' && value.countryCode) {
    const cityName = value.cityName.trim()
    return cityName
      ? { countryCode: value.countryCode, cityName }
      : { countryCode: value.countryCode }
  }
  return null
}
