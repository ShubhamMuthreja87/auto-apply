/**
 * The one MUI theme (ticket 05b): Inter, a neutral light background, one
 * primary colour, 8px spacing, rounded outlined cards and restrained shadows.
 */
import { createTheme } from "@mui/material/styles";

const divider = "#e4e7ec";
const textSecondary = "#475467";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#4f46e5" },
    background: { default: "#f6f7f9", paper: "#ffffff" },
    divider,
    text: { primary: "#101828", secondary: textSecondary },
  },
  spacing: 8,
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: "1.75rem", fontWeight: 600 },
    h2: { fontSize: "1.25rem", fontWeight: 600 },
    h3: { fontSize: "1rem", fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: "0.06em" },
  },
  components: {
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: { boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)" },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
      styleOverrides: {
        root: { borderBottom: `1px solid ${divider}` },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: textSecondary, whiteSpace: "nowrap" },
      },
    },
  },
});
