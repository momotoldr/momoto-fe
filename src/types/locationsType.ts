/** A province, as `GET /locations` lists it. */
export interface LocationProvince {
  /** Kemendagri province code, e.g. "32". */
  code: string
  name: string
}

/** One city or regency in a province. */
export interface LocationRegion {
  /** Kemendagri code, e.g. "32.73". */
  code: string
  /** Official name, e.g. "Kota Bandung". */
  name: string
  /** Card name, e.g. "Bandung" / "Kab. Bandung". */
  shortName: string
}

/** Response from `GET /locations`. */
export interface LocationsIndex {
  /** Changes whenever any list does. */
  version: string
  /** Provinces by name. */
  provinces: LocationProvince[]
  /** ISO 3166-1 alpha-2 codes offered under "Outside Indonesia" (never `ID`). */
  countries: string[]
}
