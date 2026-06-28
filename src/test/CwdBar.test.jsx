import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CwdBar } from '../components/CwdBar'
import { useChatStore } from '../store/useChatStore'

describe('CwdBar', () => {
  beforeEach(() => {
    useChatStore.setState({ cwd: null })
  })

  it('should show CWD label and default path', () => {
    render(<CwdBar />)
    expect(screen.getByText('CWD')).toBeInTheDocument()
    expect(screen.getByText('/')).toBeInTheDocument()
  })

  it('should show the current cwd path', () => {
    useChatStore.setState({ cwd: '/home/user/project' })
    render(<CwdBar />)
    expect(screen.getByText('/home/user/project')).toBeInTheDocument()
  })

  it('should switch to edit mode on click', () => {
    useChatStore.setState({ cwd: '/my/path' })
    render(<CwdBar />)

    fireEvent.click(screen.getByText('/my/path'))

    // Should show an input with the current path
    const input = document.querySelector('.cwd-bar__input')
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('/my/path')
  })

  it('should save on Enter and clear', () => {
    useChatStore.setState({ cwd: '/old' })
    render(<CwdBar />)

    fireEvent.click(screen.getByText('/old'))
    const input = document.querySelector('.cwd-bar__input')
    fireEvent.change(input, { target: { value: '/new/path' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useChatStore.getState().cwd).toBe('/new/path')
  })

  it('should cancel on Escape', () => {
    useChatStore.setState({ cwd: '/old' })
    render(<CwdBar />)

    fireEvent.click(screen.getByText('/old'))
    const input = document.querySelector('.cwd-bar__input')
    fireEvent.change(input, { target: { value: '/new' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    // Should revert
    expect(useChatStore.getState().cwd).toBe('/old')
  })
})
