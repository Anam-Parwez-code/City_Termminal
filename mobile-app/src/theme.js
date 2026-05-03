const colors = {
  careemGreen: '#47D361',
  black: '#000000',
  ink: '#111111',
  text: '#000000',
  muted: '#6B7280',
  line: '#E5E7EB',
  card: '#FFFFFF',
  cardMuted: '#F3F3F3',
  surface: '#F8F8F8',
  white: '#FFFFFF',
  danger: '#EF4444',
};

const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  title: 34,
  hero: 42,
};

const radii = {
  button: 14,
  card: 16,
  sheet: 28,
};

const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  },
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
};

const typography = {
  family: 'Inter',
  fallback: 'System',
};

export const theme = {
  colors,
  fontSizes,
  radii,
  shadows,
  typography,
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
  },
};

export default theme;
