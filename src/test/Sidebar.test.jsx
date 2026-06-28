import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../components/Sidebar'
import { useChatStore } from '../store/useChatStore'

describe('Sidebar', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      sessionId: 'abc-123',
      sessions: [],
    })
  })

  it('should show the app title', () => {
    render(<Sidebar />)
    expect(screen.getByText('Hakka')).toBeInTheDocument()
  })

  it('should show current session name when available', () => {
    useChatStore.setState({
      sessionId: 'abc-123',
      sessions: [
        { id: 'abc-123', shortId: 'abc-123', name: 'My Chat' },
      ],
    })
    render(<Sidebar />)
    expect(screen.getByText('My Chat')).toBeInTheDocument()
  })

  it('should show truncated id when session has no name', () => {
    useChatStore.setState({
      sessionId: 'xyz-789',
      sessions: [
        { id: 'xyz-789', shortId: 'xyz-789', name: '' },
      ],
    })
    render(<Sidebar />)
    expect(screen.getByText('xyz-789')).toBeInTheDocument()
  })

  it('should show a "New Session" button', () => {
    const onNew = vi.fn()
    render(<Sidebar onNewSession={onNew} />)
    fireEvent.click(screen.getByText(/new session/i))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('should list known sessions', () => {
    useChatStore.setState({
      sessionId: 'aaa',
      sessions: [
        { id: 'aaa', shortId: 'aaa', name: '' },
        { id: 'bbb', shortId: 'bbb', name: 'My Session' },
        { id: 'ccc', shortId: 'ccc', name: 'Code Review' },
      ],
    })
    const onSwitch = vi.fn()
    render(<Sidebar onSwitchSession={onSwitch} />)

    expect(screen.getByText('My Session')).toBeInTheDocument()
    expect(screen.getByText('Code Review')).toBeInTheDocument()
    // Current session should be shown (fallback to id since name is empty)
    expect(screen.getByText('aaa')).toBeInTheDocument()
  })

  it('should call onSwitchSession when clicking another session', () => {
    useChatStore.setState({
      sessionId: 'aaa',
      sessions: [
        { id: 'aaa', shortId: 'aaa', name: '' },
        { id: 'bbb', shortId: 'bbb', name: 'Other' },
      ],
    })
    const onSwitch = vi.fn()
    render(<Sidebar onSwitchSession={onSwitch} />)

    fireEvent.click(screen.getByText('Other'))
    expect(onSwitch).toHaveBeenCalledWith('bbb')
  })

  it('should show a status dot with the connection color', () => {
    render(<Sidebar />)
    // The sidebar shows a colored dot — red for disconnected
    const dot = document.querySelector('.sidebar__dot')
    expect(dot).toBeInTheDocument()
    expect(dot.style.backgroundColor).toBe('rgb(239, 68, 68)') // red
  })

  it('should show delete button on hover for non-current sessions', () => {
    useChatStore.setState({
      sessionId: 'aaa',
      sessions: [
        { id: 'aaa', shortId: 'aaa', name: 'Current' },
        { id: 'bbb', shortId: 'bbb', name: 'Other Session' },
      ],
    })
    render(<Sidebar />)
    // Delete buttons should exist for each non-current session
    const sessionRow = screen.getByText('Other Session').closest('.sidebar__session')
    expect(sessionRow).toBeInTheDocument()
    const deleteBtn = sessionRow.querySelector('.sidebar__session-delete')
    expect(deleteBtn).toBeInTheDocument()
  })

  it('should show confirmation dialog when delete button clicked', () => {
    useChatStore.setState({
      sessionId: 'aaa',
      sessions: [
        { id: 'aaa', shortId: 'aaa', name: 'Current' },
        { id: 'bbb', shortId: 'bbb', name: 'Delete Me' },
      ],
    })
    const onDelete = vi.fn()
    render(<Sidebar onDeleteSession={onDelete} />)

    const sessionRow = screen.getByText('Delete Me').closest('.sidebar__session')
    const deleteBtn = sessionRow.querySelector('.sidebar__session-delete')
    fireEvent.click(deleteBtn)

    // Confirmation dialog should appear
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    // The session name appears both in sidebar row and dialog — at least 2 occurrences
    const nameElements = screen.getAllByText('Delete Me')
    expect(nameElements.length).toBeGreaterThanOrEqual(2)
  })

  it('should call onDeleteSession when confirmed and close dialog', () => {
    useChatStore.setState({
      sessionId: 'aaa',
      sessions: [
        { id: 'aaa', shortId: 'aaa', name: 'Current' },
        { id: 'bbb', shortId: 'bbb', name: 'Delete Me' },
      ],
    })
    const onDelete = vi.fn()
    render(<Sidebar onDeleteSession={onDelete} />)

    // Click delete button
    const sessionRow = screen.getByText('Delete Me').closest('.sidebar__session')
    fireEvent.click(sessionRow.querySelector('.sidebar__session-delete'))

    // Confirm by button text "Delete" (the confirm button)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledWith('bbb')
    // Dialog should be gone
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })

  it('should close confirmation dialog on cancel', () => {
    useChatStore.setState({
      sessionId: 'aaa',
      sessions: [
        { id: 'aaa', shortId: 'aaa', name: 'Current' },
        { id: 'bbb', shortId: 'bbb', name: 'To Be Kept' },
      ],
    })
    const onDelete = vi.fn()
    render(<Sidebar onDeleteSession={onDelete} />)

    const sessionRow = screen.getByText('To Be Kept').closest('.sidebar__session')
    fireEvent.click(sessionRow.querySelector('.sidebar__session-delete'))

    // Cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })
})
