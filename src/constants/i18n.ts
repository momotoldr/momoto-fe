export const SUPPORTED_LANGUAGES = ['en', 'id'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

export const LANGUAGE_STORAGE_KEY = 'momoto.language'
