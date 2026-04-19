import type { ThemeName, ThemeSetting } from './theme.js'

export function formatThemeName(theme: ThemeName): string {
  switch (theme) {
    case 'light':
      return 'Light'
    case 'opencheeks-light':
      return 'OpenCheeks light'
    case 'light-daltonized':
      return 'Light (colorblind-friendly)'
    case 'dark-daltonized':
      return 'Dark (colorblind-friendly)'
    case 'light-ansi':
      return 'Light (ANSI)'
    case 'dark-ansi':
      return 'Dark (ANSI)'
    default:
      return 'Dark'
  }
}

export function describeThemeSetting(
  themeSetting: ThemeSetting,
  currentTheme: ThemeName,
): string {
  if (themeSetting === 'auto') {
    return `Auto -> ${formatThemeName(currentTheme)}`
  }
  return formatThemeName(currentTheme)
}
