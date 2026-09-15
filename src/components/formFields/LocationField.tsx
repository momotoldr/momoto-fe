import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchLocationsIndex, fetchProvinceRegions } from '@/api/services/locationsService'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { UserLocation } from '@/types/authType'
import type { LocationProvince, LocationRegion, LocationsIndex } from '@/types/locationsType'
import { NO_LOCATION } from '@/utils/location'
import type { LocationValues } from '@/validations'

import { FormFieldError } from './FormFieldError'
import { FormLabel } from './FormLabel'
import styles from './LocationField.module.scss'

/** The province select's value for "Outside Indonesia" — not a Kemendagri code. */
const ABROAD = 'abroad'

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

interface LocationFieldProps {
  value: LocationValues
  onChange: (value: LocationValues) => void
  /** The saved location, so its names show before the lists load — or if they never do. */
  saved: UserLocation | null
  /** Translation keys from the form's validation, per sub-field. */
  errors?: { regionCode?: string; countryCode?: string; cityName?: string }
  wrapperClassName?: string
}

/**
 * Where the user lives: a province, then one of its cities or regencies — or "Outside
 * Indonesia" with a country and an optional typed city.
 *
 * The province list loads with the field; a province's cities load only once it's picked,
 * so the second select never holds more than one province's worth. Both are native
 * selects: short lists, keyboard type-ahead and the phone's own picker for free.
 */
export function LocationField({
  value,
  onChange,
  saved,
  errors,
  wrapperClassName,
}: LocationFieldProps) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const provinceId = `${id}-province`
  const regionId = `${id}-region`
  const countryId = `${id}-country`
  const cityId = `${id}-city`

  const [index, setIndex] = useState<Load<LocationsIndex>>({ status: 'loading' })
  const [indexAttempt, setIndexAttempt] = useState(0)
  const [regions, setRegions] = useState<Load<LocationRegion[]> | null>(null)
  const [regionsAttempt, setRegionsAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setIndex({ status: 'loading' })
    fetchLocationsIndex()
      .then((data) => alive && setIndex({ status: 'ready', data }))
      .catch(() => alive && setIndex({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [indexAttempt])

  const provinceCode = value.kind === 'region' ? value.provinceCode : ''

  useEffect(() => {
    if (!provinceCode) {
      setRegions(null)
      return
    }
    let alive = true
    setRegions({ status: 'loading' })
    fetchProvinceRegions(provinceCode)
      .then((data) => alive && setRegions({ status: 'ready', data }))
      .catch(() => alive && setRegions({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [provinceCode, regionsAttempt])

  // The saved pick stays selectable while a list loads or after it fails, so the field
  // never looks emptied and an untouched profile still saves.
  const provinceOptions = useMemo<LocationProvince[]>(() => {
    const list = index.status === 'ready' ? index.data.provinces : []
    const savedProvince =
      saved?.provinceCode && saved.provinceName
        ? { code: saved.provinceCode, name: saved.provinceName }
        : null
    if (savedProvince && !list.some((p) => p.code === savedProvince.code)) {
      return [savedProvince, ...list]
    }
    return list
  }, [index, saved])

  const regionOptions = useMemo<LocationRegion[]>(() => {
    const list = regions?.status === 'ready' ? regions.data : []
    if (
      saved?.regionCode &&
      saved.regionName &&
      saved.provinceCode === provinceCode &&
      !list.some((r) => r.code === saved.regionCode)
    ) {
      return [
        { code: saved.regionCode, name: saved.regionName, shortName: saved.regionName },
        ...list,
      ]
    }
    return list
  }, [regions, saved, provinceCode])

  const countries = useMemo(() => {
    const codes =
      index.status === 'ready' ? index.data.countries : value.countryCode ? [value.countryCode] : []
    const names = new Intl.DisplayNames([i18n.language], { type: 'region' })
    return codes
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
  }, [index, i18n.language, value.countryCode])

  const provinceValue =
    value.kind === 'abroad' ? ABROAD : value.kind === 'region' ? value.provinceCode : ''

  const onProvinceChange = (next: string) => {
    if (next === ABROAD) onChange({ ...NO_LOCATION, kind: 'abroad' })
    else if (next) onChange({ ...NO_LOCATION, kind: 'region', provinceCode: next })
    else onChange(NO_LOCATION)
  }

  const regionPlaceholder = !provinceCode
    ? t('auth.profile.regencyWaiting')
    : regions?.status === 'loading'
      ? t('auth.profile.locationLoading')
      : regions?.status === 'error' && regionOptions.length === 0
        ? t('auth.profile.locationLoadError')
        : t('auth.profile.regencyPlaceholder')

  const fieldError = (key: string | undefined, forId: string) =>
    key ? <FormFieldError id={`${forId}-error`} error={t(key)} /> : null

  const invalid = (key: string | undefined, forId: string) => ({
    'aria-invalid': key ? true : undefined,
    'aria-describedby': key ? `${forId}-error` : undefined,
  })

  const retryNotice = (onRetry: () => void) => (
    <p className={styles.notice}>
      {t('auth.profile.locationLoadError')}{' '}
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('auth.profile.locationRetry')}
      </button>
    </p>
  )

  return (
    <fieldset className={cn(styles.fieldset, wrapperClassName)}>
      <legend className={styles.legend}>{t('auth.fields.location')}</legend>

      <div className={cn(styles.fields, value.kind === 'abroad' && styles.fieldsAbroad)}>
        <div className={styles.field}>
          <FormLabel htmlFor={provinceId} label={t('auth.fields.province')} />
          <select
            id={provinceId}
            className={styles.select}
            value={provinceValue}
            onChange={(event) => onProvinceChange(event.target.value)}
          >
            {/* Say what's wrong in the select itself: an empty list that looks like a
             * working one is what a failed load used to look like. */}
            <option value="">
              {provinceOptions.length > 0
                ? t('auth.profile.provincePlaceholder')
                : index.status === 'error'
                  ? t('auth.profile.locationLoadError')
                  : index.status === 'loading'
                    ? t('auth.profile.locationLoading')
                    : t('auth.profile.provincePlaceholder')}
            </option>
            {provinceOptions.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
            <option value={ABROAD}>{t('auth.profile.outsideIndonesia')}</option>
          </select>
        </div>

        {value.kind === 'abroad' ? (
          <>
            <div className={styles.field}>
              <FormLabel htmlFor={countryId} label={t('auth.fields.country')} />
              <select
                id={countryId}
                className={styles.select}
                value={value.countryCode}
                onChange={(event) => onChange({ ...value, countryCode: event.target.value })}
                {...invalid(errors?.countryCode, countryId)}
              >
                <option value="">{t('auth.profile.countryPlaceholder')}</option>
                {countries.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              {fieldError(errors?.countryCode, countryId)}
            </div>

            <div className={styles.field}>
              <FormLabel htmlFor={cityId} label={t('auth.fields.cityAbroad')} />
              <Input
                id={cityId}
                value={value.cityName}
                maxLength={60}
                autoComplete="address-level2"
                onChange={(event) => onChange({ ...value, cityName: event.target.value })}
                {...invalid(errors?.cityName, cityId)}
              />
              {fieldError(errors?.cityName, cityId)}
            </div>
          </>
        ) : (
          <div className={styles.field}>
            <FormLabel htmlFor={regionId} label={t('auth.fields.regency')} />
            <select
              id={regionId}
              className={styles.select}
              value={value.kind === 'region' ? value.regionCode : ''}
              disabled={!provinceCode}
              onChange={(event) =>
                onChange({ ...value, kind: 'region', regionCode: event.target.value })
              }
              {...invalid(errors?.regionCode, regionId)}
            >
              <option value="">{regionPlaceholder}</option>
              {regionOptions.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            {fieldError(errors?.regionCode, regionId)}
            {regions?.status === 'error'
              ? retryNotice(() => setRegionsAttempt((n) => n + 1))
              : null}
          </div>
        )}
      </div>

      {index.status === 'error' ? retryNotice(() => setIndexAttempt((n) => n + 1)) : null}

      {value.kind !== 'none' ? (
        <button type="button" className={styles.linkButton} onClick={() => onChange(NO_LOCATION)}>
          {t('auth.profile.locationClear')}
        </button>
      ) : null}
    </fieldset>
  )
}
