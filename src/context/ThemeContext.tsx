import { createContext, useContext } from 'react';

interface ThemeContextType {
  isDarkMode: boolean;
  // Utility: returns the dark-mode class if dark, else the light-mode class
  tc: (darkClass: string, lightClass: string) => string;
}

export const ThemeContext = createContext<ThemeContextType>({
  isDarkMode: true,
  tc: (d) => d,
});

export const useTheme = () => useContext(ThemeContext);
