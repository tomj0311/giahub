import { createTheme } from '@mui/material/styles';

// Updated theme definitions using colors from the provided CSS
const themeDefinitions = {
  ocean: {
    name: 'Ocean',
    palette: {
      mode: 'light',
      primary: { 
        main: '#1976d2', // blue
        contrastText: '#ffffff' // ensure white text on blue backgrounds
      },
      secondary: { 
        main: '#0288d1',
        contrastText: '#ffffff' // ensure white text on blue backgrounds
      },
      warning: { main: '#ffa000' },
      error: { main: '#e53935' },
      info: { main: '#0288d1' },
      success: { main: '#00796b' },
      background: {
        default: '#f8f9fa',
        paper: '#ffffff'
      },
      text: {
        primary: '#000000',
        secondary: '#666666'
      }
    },
    // Darker blue primary-based animated gradient for AppBar
    appBarGradient: 'linear-gradient(120deg,#0a2e5c 0%,#0d47a1 35%,#1565c0 65%,#1976d2 100%)',
    // For light theme ocean the background must be pure white
    backgroundGradient: '#f8f9fa'
  },
  aurora: {
    name: 'Aurora',
    palette: {
      mode: 'dark',
      primary: { 
        main: '#f82979ff', // Using the gradient pink from CSS
        contrastText: '#ffffff' 
      },
      secondary: { 
        main: '#E6E6F0', // Using the nav-link color from CSS
        contrastText: '#ffffff' 
      },
      success: { main: '#28a745' }, // Using the checkmark green from CSS
      info: { main: '#0288d1' },
      warning: { main: '#ffbf60' },
      error: { main: '#ff3f5d' },
      background: {
        default: '#000000', // Pure black from CSS
        paper: '#121212' // Solid dark background for dialogs
      },
      text: {
        primary: '#ffffff', // White text
        secondary: '#E6E6F0' // Nav link color
      },
      // Add gradient colors to palette
      gradient: {
        // AppBar gradient colors
        appBarStart: '#ff9d42',
        appBarMiddle: '#ff4f98ff', 
        appBarEnd: '#5d00ff',
        // Text gradient colors
        textStart: '#ef7b75',
        textSecond: '#f25c99',
        textThird: '#f63fba',
        textFourth: '#d2359e',
        textEnd: '#1E1E1E',
        // Code block colors
        codeBackground: '#050712',
        codeBorder: '#43246bff',
        codeText: '#e0e6ec',
        codeAccent: '#fc13d9ff',
        codeString: '#664cbaff',
        codeNumber: '#2fd38a',
        codeScrollbarThumb: '#332a49',
        // Scrollbar colors
        scrollbarTrack: '#050510',
        scrollbarThumb: '#332a49',
        scrollbarThumbHover: '#4a3a63'
      }
    },
    // Using gradient colors from the CSS linear-gradient(90deg, #ff9d42, #ff4fd8, #5d00ff)
    appBarGradient: 'linear-gradient(90deg, #ff9d42 0%, #ff4fd8 50%, #5d00ff 100%)',
    // Pure black background
    backgroundGradient: '#000000'
  }
};

export function buildTheme(key) {
  const def = themeDefinitions[key] || themeDefinitions.aurora;
  const theme = createTheme({
    palette: def.palette,
    shape: { borderRadius: 8 },
    typography: { 
      fontFamily: '"Inter", sans-serif', // Using Inter font from CSS
      h1: {
        fontWeight: 200, // Matching CSS font weights
        color: def.palette.text.primary
      },
      h2: {
        fontWeight: 500,
        background: def.palette.mode === 'dark' 
          ? `linear-gradient(90deg, ${def.palette.text.primary}e6, ${def.palette.text.primary}99)`
          : `linear-gradient(90deg, ${def.palette.text.primary}, #333333)`,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      },
      body1: {
        fontWeight: 400,
        color: def.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.7)'
      }
    },
    custom: {
      appBarGradient: def.appBarGradient,
      backgroundGradient: def.backgroundGradient,
      themeName: def.name,
      // Color scheme from CSS
      colors: {
        gradientText: def.palette.mode === 'dark'
          ? `linear-gradient(90deg, ${def.palette.gradient?.textStart || '#ef7b75'}, ${def.palette.gradient?.textSecond || '#f25c99'}, ${def.palette.gradient?.textThird || '#f63fba'}, ${def.palette.gradient?.textFourth || '#d2359e'}, ${def.palette.gradient?.textEnd || '#1E1E1E'})`
          : `linear-gradient(90deg, ${def.palette.primary.main}, ${def.palette.secondary.main}, ${def.palette.success.main})`,
        gradientBorder: `linear-gradient(90deg, ${def.palette.gradient?.appBarStart || '#ff9d42'}, ${def.palette.gradient?.appBarMiddle || '#ff4fd8'}, ${def.palette.gradient?.appBarEnd || '#5d00ff'})`,
        navLinkColor: def.palette.secondary.main,
        textMuted: def.palette.mode === 'dark' 
          ? 'rgba(255, 255, 255, 0.6)' 
          : 'rgba(0, 0, 0, 0.6)',
        borderColor: def.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.08)'
          : 'rgba(0, 0, 0, 0.08)'
      },
      // Unified spacing scale (multipliers of theme.spacing unit = 8px default)
      layout: {
        pageY: 5,      // vertical padding for page container (5 * 8 = 40px)
        section: 3,    // spacing after large structural blocks
        block: 2,      // standard block spacing
        dense: 1       // tight spacing
      },
      // Standard border radius values
      borderRadius: {
        small: 4,      // for small elements like chips
        standard: 8,   // standard border radius for cards and boxes
        large: 12,     // for larger containers
        pill: 100,     // for pill-shaped buttons (100px from CSS)
        none: 0        // for elements that need no border radius
      },
      version: 'ui-r3',
      codeBlock: key === 'aurora' ? {
        background: def.palette.gradient?.codeBackground || '#050712',
        border: def.palette.gradient?.codeBorder || '#43246bff',
        text: def.palette.gradient?.codeText || '#e0e6ec',
        accent: def.palette.gradient?.codeAccent || '#fc13d9ff',
        string: def.palette.gradient?.codeString || '#664cbaff',
        number: def.palette.gradient?.codeNumber || '#2fd38a',
        scrollbarThumb: def.palette.gradient?.codeScrollbarThumb || '#332a49',
        glow: `0 0 0 1px #271b37, 0 0 12px ${def.palette.gradient?.textFourth || '#d2359e'}33`
      } : {
        background: '#f5faff',
        border: '#cfd8dc',
        text: '#0d1117',
        accent: def.palette.primary.main,
        string: def.palette.secondary.main,
        number: def.palette.success.main,
        scrollbarThumb: '#90a4ae'
      }
    }
  });
  // Global baseline + keyframes using colors from provided CSS
  theme.components = {
    ...(theme.components || {}),
    MuiCssBaseline: {
      styleOverrides: {
        // Import Inter font from Google Fonts
        '@import': 'url("https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap")',
        html: {
          fontSize: '16px',
          fontFamily: '"Inter", sans-serif'
        },
        body: {
          // Use theme-specific background (white for ocean, black for aurora)
          background: def.backgroundGradient,
          backgroundAttachment: 'fixed',
          colorScheme: def.palette.mode, // match palette mode (light for ocean, dark for aurora)
          position: 'relative',
          minHeight: '100vh',
          fontFamily: '"Inter", sans-serif',
          color: def.palette.text.primary,
          margin: 0
        },
        // Remove mesh overlays to keep absolute black
        'body::before': {},
        'body::after': {},
        '@keyframes appBarShift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' }
        },
        '@keyframes glowPulse': {
          '0%,100%': { boxShadow: '0 0 0 1px rgba(210,59,255,0.35), 0 0 18px -4px rgba(210,59,255,0.55)' },
          '50%': { boxShadow: '0 0 0 1px rgba(255,90,222,0.55), 0 0 26px -4px rgba(255,90,222,0.85)' }
        },
        '@keyframes meshFlow': {
          '0%': { filter: 'brightness(1) hue-rotate(0deg)', transform: 'scale(1) translate3d(0,0,0)' },
          '33%': { filter: 'brightness(1.05) hue-rotate(25deg)', transform: 'scale(1.04) translate3d(-1%, -1%,0)' },
          '66%': { filter: 'brightness(1.08) hue-rotate(-18deg)', transform: 'scale(1.06) translate3d(1%, 1%,0)' },
          '100%': { filter: 'brightness(1.03) hue-rotate(0deg)', transform: 'scale(1.02) translate3d(0,0,0)' }
        },
        // Custom scrollbar styling from CSS
        '::-webkit-scrollbar': { width: 10 },
        '::-webkit-scrollbar-track': { 
          background: def.palette.mode === 'dark' ? (def.palette.gradient?.scrollbarTrack || '#050510') : '#f0f0f0' 
        },
        '::-webkit-scrollbar-thumb': {
          background: def.palette.mode === 'dark' ? (def.palette.gradient?.scrollbarThumb || '#332a49') : '#c0c0c0',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box'
        },
        '::-webkit-scrollbar-thumb:hover': { 
          background: def.palette.mode === 'dark' ? (def.palette.gradient?.scrollbarThumbHover || '#4a3a63') : '#a0a0a0' 
        }
      }
    }
  };
  // Ensure AppBar has no border radius regardless of theme shape
  theme.components.MuiAppBar = {
    ...(theme.components.MuiAppBar || {}),
    styleOverrides: {
      ...(theme.components.MuiAppBar?.styleOverrides || {}),
      root: {
        ...(theme.components.MuiAppBar?.styleOverrides?.root || {}),
        borderRadius: 0,
        // Ensure proper text contrast on AppBar
        color: '#ffffff',
        '& .MuiButton-root': {
          color: '#ffffff',
          '&:hover': {
            color: '#ffffff',
            backgroundColor: 'rgba(255, 255, 255, 0.1)'
          }
        },
        '& .MuiIconButton-root': {
          color: '#ffffff',
          '&:hover': {
            color: '#ffffff',
            backgroundColor: 'rgba(255, 255, 255, 0.1)'
          }
        },
        '& .MuiTypography-root': {
          color: '#ffffff'
        }
      }
    }
  };
  // Ensure Drawer paper has no border radius regardless of global Paper shape
  theme.components.MuiDrawer = {
    ...(theme.components.MuiDrawer || {}),
    styleOverrides: {
      ...(theme.components.MuiDrawer?.styleOverrides || {}),
      paper: {
        ...(theme.components.MuiDrawer?.styleOverrides?.paper || {}),
        borderRadius: 0
      }
    }
  };
  // Base Paper + soft / section variants (applies to both themes) - Updated with CSS styles
  theme.components.MuiPaper = {
    ...(theme.components.MuiPaper || {}),
    styleOverrides: {
      ...(theme.components.MuiPaper?.styleOverrides || {}),
      root: {
        ...(theme.components.MuiPaper?.styleOverrides?.root || {}),
        borderRadius: theme.shape.borderRadius,
        backgroundImage: 'none',
        background: theme.palette.mode === 'dark'
          ? theme.palette.background.paper // Solid background for dark mode
          : '#ffffff', // Solid white for light mode
        border: theme.palette.mode === 'dark' 
          ? '1px solid rgba(255, 255, 255, 0.08)' // Border color from CSS
          : '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: theme.palette.mode === 'dark'
          ? '0 4px 16px -6px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.03)'
          : '0 4px 14px -6px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.4)'
        // Removed backdropFilter to ensure solid backgrounds
      }
    },
    variants: [
      ...(theme.components.MuiPaper?.variants || []),
      {
        props: { variant: 'section' },
        style: {
          padding: theme.spacing(2.5),
          background: theme.palette.mode === 'dark'
            ? 'rgba(255, 255, 255, 0.03)' // Slightly more visible for sections
            : 'rgba(255, 255, 255, 0.95)',
          border: theme.palette.mode === 'dark' 
            ? '1px solid rgba(255, 255, 255, 0.1)' 
            : '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: '0 2px 8px -3px rgba(0, 0, 0, 0.35)',
          borderRadius: '16px' // Larger border radius for sections
        }
      },
      {
        // ultra-light panel (no border) for nested areas
        props: { variant: 'soft' },
        style: {
          padding: theme.spacing(2),
          background: theme.palette.mode === 'dark'
            ? 'rgba(255, 255, 255, 0.04)'
            : 'rgba(0, 0, 0, 0.035)',
          border: '1px solid transparent',
          boxShadow: 'none'
        }
      },
      {
        // Card variant inspired by CSS capability-box, with solid contrast in dark mode
        props: { variant: 'card' },
        style: {
          background: theme.palette.mode === 'dark'
            ? '#151515'
            : '#ffffff',
          border: theme.palette.mode === 'dark'
            ? '1px solid rgba(255, 255, 255, 0.12)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: '16px',
          padding: theme.spacing(2),
          position: 'relative',
          overflow: 'hidden',
          '&::before': theme.palette.mode === 'dark' ? {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `linear-gradient(90deg, ${def.palette.gradient?.appBarStart || '#ff9d42'}, ${def.palette.gradient?.appBarMiddle || '#ff4fd8'}, ${def.palette.gradient?.appBarEnd || '#5d00ff'})`,
            borderRadius: '16px 16px 0 0'
          } : {}
        }
      }
    ]
  };
  // Add component overrides for aurora theme with CSS-inspired styling
  if (key === 'aurora') {
    const existingPaper = theme.components.MuiPaper || {};
    const existingPaperRoot = existingPaper.styleOverrides?.root || {};
    const existingPaperVariants = existingPaper.variants || [];
    theme.components = {
      ...(theme.components || {}),
      MuiButton: {
        defaultProps: {
          variant: 'gradientBorder',
          size: 'medium'
        },
        styleOverrides: {
          root: {
            position: 'relative',
            textTransform: 'none',
            fontWeight: 500, // From CSS font-weight
            letterSpacing: 0.3,
            borderRadius: 9999, // robust pill radius
            overflow: 'hidden',
            fontSize: '14px', // From CSS
            minWidth: 'auto', // Prevent growing
            flexShrink: 0, // Prevent shrinking
            whiteSpace: 'nowrap', // Prevent text wrapping
            // Fixed sizes for consistency - prevent growing on screen resize
            '&.MuiButton-sizeSmall': {
              height: 32,
              padding: '4px 12px',
              fontSize: '13px',
              minWidth: 64,
              maxWidth: '200px'
            },
            '&.MuiButton-sizeMedium': {
              height: 40,
              padding: '6px 16px',
              fontSize: '14px',
              minWidth: 80,
              maxWidth: '250px'
            },
            '&.MuiButton-sizeLarge': {
              height: 48,
              padding: '8px 24px',
              fontSize: '15px',
              minWidth: 96,
              maxWidth: '300px'
            }
          },
          containedPrimary: {
            // Using Aurora theme gradient instead of white background
            background: `linear-gradient(135deg, ${theme.palette.gradient?.appBarStart || '#ff9d42'} 0%, ${theme.palette.gradient?.appBarMiddle || '#ff4fd8'} 50%, ${theme.palette.gradient?.appBarEnd || '#5d00ff'} 100%)`,
            color: '#ffffff', // White text on gradient background
            boxShadow: '0 4px 12px rgba(255, 77, 216, 0.3)', // Gradient-themed shadow
            border: 'none',
            // Remove responsive padding - use fixed sizes from root
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.gradient?.appBarStart || '#ff9d42'} 0%, ${theme.palette.gradient?.appBarMiddle || '#ff4fd8'} 40%, ${theme.palette.gradient?.appBarEnd || '#5d00ff'} 90%)`,
              boxShadow: '0 6px 16px rgba(255, 77, 216, 0.4)',
              color: '#ffffff',
              transform: 'translateY(-1px)'
            },
            '&:active': {
              transform: 'translateY(0)',
              boxShadow: '0 2px 8px rgba(255, 77, 216, 0.3)'
            },
            '&:disabled': {
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.5)',
              boxShadow: 'none'
            }
          },
          containedSecondary: {
            // Gradient secondary button for Aurora theme
            background: `linear-gradient(135deg, ${theme.palette.gradient?.textStart || '#ef7b75'} 0%, ${theme.palette.gradient?.textSecond || '#f25c99'} 50%, ${theme.palette.gradient?.textThird || '#f63fba'} 100%)`,
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(239, 123, 117, 0.3)',
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.gradient?.textStart || '#ef7b75'} 0%, ${theme.palette.gradient?.textSecond || '#f25c99'} 40%, ${theme.palette.gradient?.textThird || '#f63fba'} 90%)`,
              boxShadow: '0 6px 16px rgba(239, 123, 117, 0.4)',
              color: '#ffffff',
              transform: 'translateY(-1px)'
            },
            '&:active': {
              transform: 'translateY(0)',
              boxShadow: '0 2px 8px rgba(239, 123, 117, 0.3)'
            },
            '&:disabled': {
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.5)',
              boxShadow: 'none'
            }
          },
          outlinedPrimary: {
            // Using the btn-gradient style from CSS
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 32%)',
            color: theme.palette.secondary.main, // Nav link color
            borderColor: 'rgba(255, 255, 255, 0.28)', // From CSS
            borderRadius: 9999,
            fontSize: '14px',
            fontWeight: 500,
            // Remove responsive padding - use fixed sizes from root
            '&:hover': { 
              opacity: 0.9,
              borderColor: 'rgba(255, 255, 255, 0.4)',
              color: theme.palette.text.primary // Ensure bright white text on hover
            }
          },
          outlinedSecondary: {
            background: 'rgba(255, 255, 255, 0.05)',
            color: theme.palette.secondary.main,
            borderColor: 'rgba(255, 255, 255, 0.2)',
            '&:hover': {
              background: 'rgba(255, 255, 255, 0.1)',
              borderColor: 'rgba(255, 255, 255, 0.3)',
              color: theme.palette.text.primary
            }
          }
        },
        variants: [
          {
            // Gradient border button from CSS
            props: { variant: 'gradientBorder' },
            style: {
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              // Remove responsive padding - use fixed sizes from root
              color: '#fff',
              textDecoration: 'none',
              borderRadius: 9999,
              backgroundColor: 'transparent',
              border: 'none',
              zIndex: 1,
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                padding: '2px',
                background: `linear-gradient(90deg, ${theme.palette.gradient?.appBarStart || '#ff9d42'}, ${theme.palette.gradient?.appBarMiddle || '#ff4fd8'}, ${theme.palette.gradient?.appBarEnd || '#5d00ff'})`,
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                pointerEvents: 'none'
              },
              '&:hover': {
                opacity: 0.9
              }
            }
          },
          {
            // Add specific variant for buttons that might appear on white/light backgrounds
            props: { variant: 'text', color: 'inherit' },
            style: {
              color: theme.palette.secondary.main, // Ensure light text on dark theme
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: theme.palette.text.primary
              }
            }
          }
        ]
      },
      MuiPaper: {
        styleOverrides: {
          ...existingPaper.styleOverrides,
          root: {
            ...existingPaperRoot,
            // Solid paper so boxes stand out from the pure black page background
            background: theme.palette.background.paper,
            border: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow: '0 6px 28px -12px #000, 0 0 0 1px rgba(255, 255, 255, 0.04)'
            // keep blur off to avoid washing out backgrounds
          }
        },
        variants: existingPaperVariants
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: theme.palette.background.paper,
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 6px 28px -12px #000, 0 0 0 1px rgba(255, 255, 255, 0.04)'
          }
        }
      },
      MuiBox: {
        styleOverrides: {
          root: {
            // Ensure Box has same background as Paper/Card when needed
            '&.MuiBox-background-paper': {
              backgroundColor: theme.palette.background.paper,
              border: '1px solid rgba(255, 255, 255, 0.10)',
              boxShadow: '0 6px 28px -12px #000, 0 0 0 1px rgba(255, 255, 255, 0.04)'
            }
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: 'rgba(0, 0, 0, 0.7)', // From CSS site-header
            backdropFilter: 'saturate(180%) blur(8px)', // From CSS
            boxShadow: 'none', // Clean look like CSS
            borderRadius: 0
          }
        }
      },
      MuiAlert: {
        styleOverrides: {
          action: {
            // Ensure alert action buttons have proper contrast
            '& .MuiButton-colorInherit': {
              color: theme.palette.secondary.main,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: theme.palette.text.primary
              }
            }
          }
        }
      },
      MuiAutocomplete: {
        defaultProps: {
          fullWidth: true,
          size: 'medium'
        },
        styleOverrides: {
          paper: {
            // Override transparent background for autocomplete dropdowns
            background: theme.palette.mode === 'dark' 
              ? 'rgba(18, 18, 18, 0.95)' // Solid dark background
              : 'rgba(255, 255, 255, 0.95)', // Solid light background
            backdropFilter: 'blur(12px) saturate(180%)',
            border: theme.palette.mode === 'dark'
              ? '1px solid rgba(255, 255, 255, 0.15)'
              : '1px solid rgba(0, 0, 0, 0.15)',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
              : '0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          },
          listbox: {
            // Ensure listbox has proper background
            background: 'transparent',
            '& .MuiAutocomplete-option': {
              // Ensure options have proper hover states
              '&:hover': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.04)'
              },
              '&[aria-selected="true"]': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.08)'
              }
            }
          }
        }
      },
  MuiMenu: {
        styleOverrides: {
          paper: {
            // Override transparent background for select/menu dropdowns
            background: theme.palette.mode === 'dark' 
              ? 'rgba(18, 18, 18, 0.95)' // Solid dark background
              : 'rgba(255, 255, 255, 0.95)', // Solid light background
            backdropFilter: 'blur(12px) saturate(180%)',
            border: theme.palette.mode === 'dark'
              ? '1px solid rgba(255, 255, 255, 0.15)'
              : '1px solid rgba(0, 0, 0, 0.15)',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
              : '0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          },
          list: {
            // Ensure menu list has proper background
            background: 'transparent',
            '& .MuiMenuItem-root': {
              // Ensure menu items have proper hover states
              '&:hover': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.04)'
              },
              '&.Mui-selected': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.08)',
                '&:hover': {
                  background: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.16)'
                    : 'rgba(0, 0, 0, 0.12)'
                }
              }
            }
          }
        }
  },
  // Unify form control sizes and spacing
      MuiTextField: {
        defaultProps: {
          size: 'medium',
          fullWidth: true
        }
      },
      MuiFormControl: {
        defaultProps: {
          size: 'medium',
          margin: 'normal'
        }
      }
    };
  } else {
    // Ocean theme button styling
    theme.components = {
      ...(theme.components || {}),
      MuiButton: {
        defaultProps: {
          variant: 'gradientBorder',
          size: 'medium'
        },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            borderRadius: 9999,
            fontSize: '14px',
            minWidth: 'auto', // Prevent growing
            flexShrink: 0, // Prevent shrinking
            whiteSpace: 'nowrap', // Prevent text wrapping
            // Fixed sizes for consistency - prevent growing on screen resize
            '&.MuiButton-sizeSmall': {
              height: 32,
              padding: '4px 12px',
              fontSize: '13px',
              minWidth: 64,
              maxWidth: '200px'
            },
            '&.MuiButton-sizeMedium': {
              height: 40,
              padding: '6px 16px',
              fontSize: '14px',
              minWidth: 80,
              maxWidth: '250px'
            },
            '&.MuiButton-sizeLarge': {
              height: 48,
              padding: '8px 24px',
              fontSize: '15px',
              minWidth: 96,
              maxWidth: '300px'
            }
          },
          containedPrimary: {
            background: 'linear-gradient(135deg, #1976d2 0%, #0288d1 100%)',
            color: '#ffffff', // Ensure white text on blue background for high contrast
            boxShadow: '0 2px 6px rgba(25, 118, 210, 0.3)',
            // Remove responsive padding - use fixed sizes from root
            '&:hover': {
              background: 'linear-gradient(135deg, #1565c0 0%, #0277bd 100%)',
              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)',
              color: '#ffffff' // Maintain white text on hover
            },
            '&:disabled': {
              background: '#e0e0e0',
              color: '#666666' // Dark text on light disabled background
            }
          },
          containedSecondary: {
            background: 'linear-gradient(135deg, #0288d1 0%, #00796b 100%)',
            color: '#ffffff',
            '&:hover': {
              background: 'linear-gradient(135deg, #0277bd 0%, #00695c 100%)',
              color: '#ffffff'
            },
            '&:disabled': {
              background: '#e0e0e0',
              color: '#666666'
            }
          },
          outlinedPrimary: {
            borderColor: '#1976d2',
            color: '#1976d2', // Blue text on white background provides good contrast
            borderRadius: 9999,
            fontSize: '14px',
            // Remove responsive padding - use fixed sizes from root
            '&:hover': {
              borderColor: '#1565c0',
              backgroundColor: 'rgba(25, 118, 210, 0.04)',
              color: '#1565c0' // Slightly darker blue on hover
            }
          },
          outlinedSecondary: {
            borderColor: '#0288d1',
            color: '#0288d1',
            '&:hover': {
              borderColor: '#0277bd',
              backgroundColor: 'rgba(2, 136, 209, 0.04)',
              color: '#0277bd'
            }
          }
        },
        variants: [
          {
            // Gradient border CTA (pill) to match screenshot
            props: { variant: 'gradientBorder' },
            style: {
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              // Remove responsive padding - use fixed sizes from root
              color: theme.palette.primary.main,
              textDecoration: 'none',
              borderRadius: 9999,
              backgroundColor: 'transparent',
              border: 'none',
              zIndex: 1,
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                padding: '2px',
                background: `linear-gradient(90deg, ${def.palette.gradient?.appBarStart || '#ff9d42'}, ${def.palette.gradient?.appBarMiddle || '#ff4fd8'}, ${def.palette.gradient?.appBarEnd || '#5d00ff'})`,
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                pointerEvents: 'none'
              },
              '&:hover': {
                opacity: 0.9
              }
            }
          },
          {
            // Add specific variant for buttons that might appear on white/light backgrounds
            props: { variant: 'text', color: 'inherit' },
            style: {
              color: theme.palette.primary.main, // Use primary blue color for inherit text buttons on light theme
              '&:hover': {
                backgroundColor: `rgba(25, 118, 210, 0.04)`,
                color: '#1565c0'
              }
            }
          }
        ]
      },
      MuiAlert: {
        styleOverrides: {
          action: {
            // Ensure alert action buttons have proper contrast
            '& .MuiButton-colorInherit': {
              color: theme.palette.primary.main,
              '&:hover': {
                backgroundColor: `rgba(25, 118, 210, 0.04)`,
                color: '#1565c0'
              }
            }
          }
        }
      },
      MuiAutocomplete: {
        defaultProps: {
          fullWidth: true,
          size: 'medium'
        },
        styleOverrides: {
          paper: {
            // Override transparent background for autocomplete dropdowns
            background: theme.palette.mode === 'dark' 
              ? 'rgba(18, 18, 18, 0.95)' // Solid dark background
              : 'rgba(255, 255, 255, 0.95)', // Solid light background
            backdropFilter: 'blur(12px) saturate(180%)',
            border: theme.palette.mode === 'dark'
              ? '1px solid rgba(255, 255, 255, 0.15)'
              : '1px solid rgba(0, 0, 0, 0.15)',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
              : '0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          },
          listbox: {
            // Ensure listbox has proper background
            background: 'transparent',
            '& .MuiAutocomplete-option': {
              // Ensure options have proper hover states
              '&:hover': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.04)'
              },
              '&[aria-selected="true"]': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.08)'
              }
            }
          }
        }
      },
  MuiMenu: {
        styleOverrides: {
          paper: {
            // Override transparent background for select/menu dropdowns
            background: theme.palette.mode === 'dark' 
              ? 'rgba(18, 18, 18, 0.95)' // Solid dark background
              : 'rgba(255, 255, 255, 0.95)', // Solid light background
            backdropFilter: 'blur(12px) saturate(180%)',
            border: theme.palette.mode === 'dark'
              ? '1px solid rgba(255, 255, 255, 0.15)'
              : '1px solid rgba(0, 0, 0, 0.15)',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
              : '0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          },
          list: {
            // Ensure menu list has proper background
            background: 'transparent',
            '& .MuiMenuItem-root': {
              // Ensure menu items have proper hover states
              '&:hover': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.04)'
              },
              '&.Mui-selected': {
                background: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.08)',
                '&:hover': {
                  background: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.16)'
                    : 'rgba(0, 0, 0, 0.12)'
                }
              }
            }
          }
        }
  },
  // Unify form control sizes and spacing
      MuiTextField: {
        defaultProps: {
          size: 'medium',
          fullWidth: true
        }
      },
      MuiFormControl: {
        defaultProps: {
          size: 'medium',
          margin: 'normal'
        }
      }
    };
  }
  return theme;
}

export const themeOrder = ['aurora', 'ocean'];

// Return the first theme key whose palette.mode matches the requested mode.
// Falls back to the first entry in themeOrder when no exact match is found.
export function getThemeKeyForMode(mode) {
  for (const key of themeOrder) {
    const def = themeDefinitions[key];
    if (def && def.palette && def.palette.mode === mode) return key;
  }
  return themeOrder[0];
}
