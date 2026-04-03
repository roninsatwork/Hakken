import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatInput from './ChatInput'

// --- Mocking Dependencies ---

// 1. Mock Convex
const mockSendMessage = vi.fn().mockResolvedValue(true)
vi.mock('convex/react', async (importOriginal) => {
  return {
    useMutation: vi.fn(() => mockSendMessage),
    useQuery: vi.fn(() => [{ modelId: 'fast', displayName: 'Fast', isEnabled: true, isDefault: true }]),
  }
})

// 2. Mock Generated APIs
vi.mock('@/convex/_generated/api', () => ({
  api: { 
    chat: { sendMessage: 'mock_api_send' },
    aiModels: { getModels: 'mock_get_models' }
  },
}))

// 3. Mock Custom Hooks
const mockToggleRecording = vi.fn()
vi.mock('@/src/hooks/useVoiceToText', () => ({
  useVoiceToText: vi.fn(() => ({
    isRecording: false,
    isTranscribing: false,
    toggleRecording: mockToggleRecording,
    permissionError: false,
    setPermissionError: vi.fn(),
  })),
}))

vi.mock('@/src/context/SystemSettingsContext', () => ({
  useSystemSettings: vi.fn(() => ({
    platformName: 'Sonae',
  })),
}))

// 4. Mock complex nested components if necessary (like Modals)
vi.mock('../feedback/SonaeModal', () => ({
  default: ({ isOpen, children }: any) => (isOpen ? <div data-testid="mock-modal">{children}</div> : null),
}))

// 5. jsdom matchMedia mock (needed for some framed-motion or layout components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

describe('ChatInput Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the core elements with correct platform name', () => {
    render(<ChatInput threadId={"mock_thread_123" as any} />)
    
    // Check placeholder uses system settings
    expect(screen.getByPlaceholderText('Enter a prompt for Sonae')).toBeInTheDocument()
    
    // Check legal text uses system settings
    expect(screen.getByText(/Sonae Assistant is AI/i)).toBeInTheDocument()
    
    // Check default model text (can be twice if dropdown is rendered)
    expect(screen.getAllByText('Fast')[0]).toBeInTheDocument()
  })

  it('handles typing and calling sendMessage on submit', async () => {
    render(<ChatInput threadId={"mock_thread_123" as any} />)
    
    const textarea = screen.getByPlaceholderText('Enter a prompt for Sonae')
    const submitButton = screen.getByRole('button', { name: '' }) // Button with ArrowUp icon
    
    // Type a message
    fireEvent.change(textarea, { target: { value: 'Hello AI' } })
    expect(textarea).toHaveValue('Hello AI')
    
    // Submit
    fireEvent.click(submitButton)
    
    // Verify our mock was called
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        threadId: 'mock_thread_123',
        content: 'Hello AI',
        modelId: 'fast',
        thinkingLevel: 'NONE'
      })
    })
    
    // Textarea clears optimistically
    expect(textarea).toHaveValue('')
  })
})
