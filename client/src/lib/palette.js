// Chart colours from the validated categorical palette (light and dark steps of the same hues).
// Slot order matters for colour-blind separation; assign in this order, never cycled.
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function chartTheme(dark) {
  return dark
    ? { series: DARK, grid: '#2c2c2a', axis: '#383835', muted: '#898781', text: '#c3c2b7', surface: '#1a1a19', good: '#0ca30c', critical: '#d03b3b' }
    : { series: LIGHT, grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', text: '#52514e', surface: '#ffffff', good: '#0ca30c', critical: '#d03b3b' };
}

// Fixed colour per payment mode so it never changes with filters.
export const MODE_SLOT = { UPI: 0, Card: 1, Cash: 2 };
