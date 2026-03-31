import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ThemeToggle from './ThemeToggle'
import { ThemeProvider } from 'next-themes'

// Mock matchMedia which jsdom doesn't support by default
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

describe('ThemeToggle Component', () => {
  it('renders without crashing', () => {
    render(
      <ThemeProvider attribute="class">
        <ThemeToggle />
      </ThemeProvider>
    )
    
    // Initially, it might render the skeleton because mounted=false, then updates
    // The skeleton is just a div without the button. Wait for button to be in document.
    const container = screen.getByRole('button', { name: /toggle theme/i, hidden: true }) 
       // Note: "Toggle Theme" text is in the tooltip, we can query by text
       ?? screen.getByText('Toggle Theme')
       
    expect(screen.getByText('Toggle Theme')).toBeInTheDocument()
  })
})
